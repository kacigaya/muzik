import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "../scripts/audit_dependencies.mjs";

function fixture() {
  const advisory = { name: "braces", severity: "high", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" };
  const report = { auditReportVersion: 2, vulnerabilities: {
    braces: { severity: "high", via: [advisory], nodes: ["node_modules/braces"] },
    micromatch: { severity: "high", via: ["braces"], nodes: ["node_modules/micromatch"] },
    tooling: { severity: "high", via: ["micromatch"], nodes: ["node_modules/tooling"] },
  } };
  const lock = { packages: Object.fromEntries(["braces", "micromatch", "tooling"].map((name) => [
    `node_modules/${name}`, { dev: true, version: name === "braces" ? "3.0.3" : "1.0.0" },
  ])) };
  return { report, lock };
}
const BEFORE = Date.parse("2026-10-07T00:00:00Z");

test("audit excepts only reviewed dev-only braces and its dependent findings", () => {
  const { report, lock } = fixture();
  assert.deepEqual(evaluateAudit(report, lock, BEFORE).exceptions, ["braces", "micromatch", "tooling"]);
  assert.deepEqual(evaluateAudit(report, lock, BEFORE).blocking, []);
});

test("audit exception expires at its UTC deadline", () => {
  const { report, lock } = fixture();
  assert.equal(evaluateAudit(report, lock, Date.parse("2026-11-07T00:00:00Z")).blocking.length, 3);
});

test("audit rejects production copies, changed versions, and missing lock records", () => {
  for (const change of [
    (lock) => { lock.packages["node_modules/braces"].dev = false; },
    (lock) => { lock.packages["node_modules/braces"].version = "3.0.4"; },
    (lock) => { delete lock.packages["node_modules/braces"]; },
    (lock) => { lock.packages["node_modules/tooling"].dev = false; },
  ]) {
    const { report, lock } = fixture();
    change(lock);
    assert.ok(evaluateAudit(report, lock, BEFORE).blocking.includes("tooling"));
  }
});

test("audit rejects other advisories and critical findings in the same chain", () => {
  for (const change of [
    (report) => { report.vulnerabilities.braces.via[0].url = "https://github.com/advisories/another"; },
    (report) => { report.vulnerabilities.braces.severity = "critical"; },
    (report) => { report.vulnerabilities.tooling.via.push({ name: "tooling", severity: "high", url: "https://github.com/advisories/another" }); },
  ]) {
    const { report, lock } = fixture();
    change(report);
    assert.ok(evaluateAudit(report, lock, BEFORE).blocking.includes("tooling"));
  }
});

test("audit preserves the high threshold for unrelated findings", () => {
  const { report, lock } = fixture();
  report.vulnerabilities.other = { severity: "moderate", via: [{ url: "other" }], nodes: ["node_modules/other"] };
  assert.deepEqual(evaluateAudit(report, lock, BEFORE).blocking, []);
  report.vulnerabilities.other.severity = "high";
  assert.deepEqual(evaluateAudit(report, lock, BEFORE).blocking, ["other"]);
});

test("audit fails closed on missing dependencies and cycles", () => {
  const { report, lock } = fixture();
  report.vulnerabilities.tooling.via = ["missing"];
  assert.ok(evaluateAudit(report, lock, BEFORE).blocking.includes("tooling"));
  report.vulnerabilities.tooling.via = ["tooling"];
  assert.ok(evaluateAudit(report, lock, BEFORE).blocking.includes("tooling"));
});

test("audit fails closed on failed or malformed reports", () => {
  const { report, lock } = fixture();
  for (const invalid of [{}, { ...report, error: {} }, { ...report, auditReportVersion: 1 },
    { ...report, vulnerabilities: [] }, { ...report, vulnerabilities: { broken: {} } }]) {
    assert.throws(() => evaluateAudit(invalid, lock, BEFORE));
  }
  assert.throws(() => evaluateAudit(report, {}, BEFORE));
});
