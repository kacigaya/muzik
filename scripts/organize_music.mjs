import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { organizeLibrary } from "../lib/metadata.ts";

const exec = promisify(execFile);
const musicDir = process.env.MUZIK_MUSIC_DIR ?? "/srv/media-rw/Music";
const dataDir = process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data";
const result = await organizeLibrary(musicDir, dataDir);

console.log(`Processed ${result.total}, modified ${result.modified}, Other ${result.other}, warnings ${result.warnings.length}.`);
for (const warning of result.warnings) console.warn(warning);
await exec("sudo", ["-n", "podman", "exec", "navidrome", "navidrome", "scan", "--full"], { timeout: 10 * 60_000 });
