import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { safeMusicPath } from "./metadata.ts";
import { musicDir } from "./settings.ts";
import { VIDEO_ID } from "./validation.ts";
import type { LibraryEntry } from "./types.ts";

const AUDIO_EXTENSIONS = new Set([".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"]);

/** Muzik names downloads "... [videoId].ext", which is how a track finds its source again. */
export function sourceIdFromName(name: string) {
  const match = name.match(/\[([A-Za-z0-9_-]{11})\]\.[^.]+$/);
  return match && VIDEO_ID.test(match[1]) ? match[1] : null;
}

export function deletionAllowed() {
  return /^(1|true|yes|on)$/i.test(process.env.MUZIK_ALLOW_DELETE ?? "");
}

async function resolveInside(path: string) {
  const root = await musicDir();
  if (!root) throw new Error("No music folder is configured yet.");
  // safeMusicPath only accepts paths strictly under the root, so the root is handled here.
  if (!path) return { root, target: root };
  const target = safeMusicPath(root, join(root, path));
  if (!target) throw new Error("Path is outside the music folder.");
  return { root, target };
}

export async function listLibrary(path: string) {
  const { root, target } = await resolveInside(path);
  const entries = await readdir(target, { withFileTypes: true });
  const listed: LibraryEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      listed.push({ name: entry.name, path: relative(root, full), kind: "folder", sizeBytes: null, sourceId: null });
      continue;
    }
    if (!AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const info = await stat(full);
    listed.push({
      name: entry.name,
      path: relative(root, full),
      kind: "track",
      sizeBytes: info.size,
      sourceId: sourceIdFromName(entry.name),
    });
  }
  listed.sort((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === "folder" ? -1 : 1));
  return { path: relative(root, target), entries: listed };
}

async function idsUnder(target: string): Promise<string[]> {
  const info = await stat(target);
  if (info.isFile()) {
    const id = sourceIdFromName(target);
    return id ? [id] : [];
  }
  const found: string[] = [];
  for (const entry of await readdir(target, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const id = sourceIdFromName(entry.name);
    if (id) found.push(id);
  }
  return found;
}

/** Without this a deleted track can never be downloaded again: yt-dlp skips archived ids. */
async function pruneArchive(ids: string[]) {
  if (!ids.length) return;
  const archive = join(process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data", "downloaded.txt");
  let content: string;
  try {
    content = await readFile(archive, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return;
  }
  const removing = new Set(ids);
  const kept = content.split("\n").filter((line) => {
    const id = line.trim().split(/\s+/).at(-1) ?? "";
    return !removing.has(id);
  });
  const temporary = `${archive}.tmp`;
  await writeFile(temporary, kept.join("\n"), { mode: 0o600 });
  await rename(temporary, archive);
}

export async function removeFromLibrary(path: string) {
  if (!deletionAllowed()) throw new Error("Deleting is disabled. Set MUZIK_ALLOW_DELETE=1 to enable it.");
  if (!path) throw new Error("Path is invalid.");
  const { root, target } = await resolveInside(path);
  if (target === root) throw new Error("The library root cannot be deleted.");
  const ids = await idsUnder(target);
  await rm(target, { recursive: true, force: false });
  await pruneArchive(ids);
  return { path: relative(root, target), sourceIds: ids };
}
