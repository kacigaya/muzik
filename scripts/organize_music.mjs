import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { organizeLibrary } from "../lib/metadata.ts";
import { musicDir } from "../lib/settings.ts";

const exec = promisify(execFile);
const library = await musicDir();
if (!library) {
  console.error("No music folder is configured yet. Open Muzik and finish setup, or set MUZIK_MUSIC_DIR.");
  process.exit(1);
}
const dataDir = process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data";
const result = await organizeLibrary(library, dataDir);

console.log(`Processed ${result.total}, modified ${result.modified}, Other ${result.other}, warnings ${result.warnings.length}.`);
for (const warning of result.warnings) console.warn(warning);

const navidromeContainer = process.env.MUZIK_NAVIDROME_CONTAINER ?? "";
if (navidromeContainer) {
  const cli = process.env.MUZIK_CONTAINER_CLI ?? "podman";
  await exec("sudo", ["-n", cli, "exec", navidromeContainer, "navidrome", "scan", "--full"], { timeout: 10 * 60_000 });
}
