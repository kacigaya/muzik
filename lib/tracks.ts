import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SearchItem, SearchKind } from "./types.ts";

const exec = promisify(execFile);

export async function listTracks(kind: Extract<SearchKind, "album" | "playlist">, sourceId: string) {
  const python = process.env.MUZIK_PYTHON ?? `${process.cwd()}/.venv/bin/python`;
  const script = `${process.cwd()}/scripts/search_music.py`;
  const { stdout } = await exec(python, [script, "tracks", kind, sourceId], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return (JSON.parse(stdout) as { items: SearchItem[] }).items;
}
