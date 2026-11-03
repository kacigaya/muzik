import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listeningTrack, updateListeningLibrary, type ListeningCommand, type ListeningLibrary } from "./listening.ts";

const state = globalThis as typeof globalThis & { muzikListeningSaveChain?: Promise<void> };
function directory() { return process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data"; }
function file() { return join(directory(), "listening.json"); }

export async function readListeningLibrary(): Promise<ListeningLibrary> {
  let raw: string;
  try { raw = await readFile(file(), "utf8"); } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { likes: [], playlists: [] };
    throw cause;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") throw new Error();
    const value = data as Record<string, unknown>;
    if (!Array.isArray(value.likes) || value.likes.length > 5000 || !Array.isArray(value.playlists) || value.playlists.length > 100) throw new Error();
    return {
      likes: value.likes.map(listeningTrack),
      playlists: value.playlists.map((entry: unknown) => {
        if (!entry || typeof entry !== "object") throw new Error();
        const playlist = entry as Record<string, unknown>;
        if (typeof playlist.id !== "string" || !/^[a-f0-9-]{36}$/.test(playlist.id) || typeof playlist.name !== "string" || !playlist.name.trim() || playlist.name.length > 100 || !Array.isArray(playlist.tracks) || playlist.tracks.length > 1000) throw new Error();
        return { id: playlist.id, name: playlist.name, tracks: playlist.tracks.map(listeningTrack) };
      }),
    };
  } catch {
    throw new Error("Saved music file is invalid. Check listening.json before saving changes.");
  }
}

export function changeListeningLibrary(command: ListeningCommand): Promise<ListeningLibrary> {
  const operation = async () => {
    const library = updateListeningLibrary(await readListeningLibrary(), command, randomUUID());
    await mkdir(directory(), { recursive: true });
    const temporary = `${file()}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(library), { mode: 0o600 });
      await rename(temporary, file());
    } finally { await rm(temporary, { force: true }); }
    return library;
  };
  const run = (state.muzikListeningSaveChain ?? Promise.resolve()).then(operation, operation);
  state.muzikListeningSaveChain = run.then(() => undefined, () => undefined);
  return run;
}
