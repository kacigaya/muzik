import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const EXPIRES = Date.parse("2026-11-07T00:00:00Z");
const SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

// Next.js lint tooling requires unpatched braces. This exception covers only
// the reviewed dev-only version and its npm metavulnerabilities, until expiry.
export function evaluateAudit(report, lock, now = Date.now()) {
  if (report?.auditReportVersion !== 2 || report.error || !report.vulnerabilities
    || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)
    || !lock?.packages || !Number.isFinite(now)) throw new Error("Invalid dependency audit input.");
  const findings = report.vulnerabilities;
  for (const finding of Object.values(findings)) {
    if (!finding || !SEVERITIES.has(finding.severity)
      || !Array.isArray(finding.via) || !finding.via.length
      || !Array.isArray(finding.nodes) || !finding.nodes.length
      || !finding.nodes.every((node) => typeof node === "string")
      || !finding.via.every((via) => typeof via === "string"
        || (via && typeof via === "object" && typeof via.url === "string"))) {
      throw new Error("Invalid dependency audit finding.");
    }
  }
  function excepted(name, seen = new Set()) {
    const finding = findings[name];
    if (!finding || seen.has(name) || now >= EXPIRES
      || finding.severity === "critical"
      || !finding.nodes.every((node) => lock.packages[node]?.dev === true)) return false;
    const visited = new Set([...seen, name]);
    return finding.via.every((via) => typeof via === "string"
      ? excepted(via, visited)
      : name === "braces" && via.name === "braces" && via.url === ADVISORY
        && via.severity === "high"
        && finding.nodes.every((node) => lock.packages[node].version === "3.0.3"));
  }
  const exceptions = [];
  const blocking = [];
  for (const [name, finding] of Object.entries(findings)) {
    if (excepted(name)) exceptions.push(name);
    else if (["high", "critical"].includes(finding.severity)) blocking.push(name);
  }
  return { exceptions, blocking, reported: Object.keys(findings) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = spawnSync("npm", ["audit", "--json"], {
      encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || ![0, 1].includes(result.status)) throw new Error("npm audit could not complete.");
    const report = JSON.parse(result.stdout);
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const { exceptions, blocking, reported } = evaluateAudit(report, lock);
    for (const name of reported) console.log(`${name}: ${report.vulnerabilities[name].severity}`);
    if (exceptions.length) {
      console.warn(`Temporary dev-only braces@3.0.3 exception: ${ADVISORY}; expires 2026-11-07 UTC. Includes: ${exceptions.join(", ")}.`);
    }
    if (blocking.length) throw new Error(`Blocking dependency findings: ${blocking.join(", ")}.`);
    console.log("Dependency audit passed: no unexcepted high or critical findings.");
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : "Dependency audit failed.");
    process.exitCode = 1;
  }
}
