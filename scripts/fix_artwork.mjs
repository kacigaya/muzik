import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { createAlbumCover } from "../lib/artwork.ts";
import { musicDir } from "../lib/settings.ts";

const root = await musicDir();
if (!root) throw new Error("Configure a music folder before repairing artwork.");
const extensions = new Set([".m4a", ".mp3", ".flac", ".ogg", ".opus", ".wav"]);
let created = 0;
let failures = 0;
const folders = [];
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) await walk(join(folder, entry.name));
  }
  folders.push({ folder, entries });
}
async function repair({ folder, entries }) {
  for (const entry of entries) {
    if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) continue;
    try {
      if (await createAlbumCover(join(folder, entry.name))) {
        created++;
        console.log(`Created: ${join(folder, "cover.jpg")}`);
        break;
      }
    } catch (cause) {
      failures++;
      console.error(`${join(folder, entry.name)}: ${cause.message}`);
    }
  }
}
await walk(root);
await Promise.all(Array.from({ length: 4 }, async () => {
  while (folders.length) await repair(folders.pop());
}));
console.log(`Created ${created} square album covers; ${failures} failures. Existing covers and audio files preserved.`);
if (failures) process.exitCode = 1;
