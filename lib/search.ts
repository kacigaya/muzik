import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SearchResponse } from "./types.ts";

const exec = promisify(execFile);

export async function searchMusic(query: string): Promise<SearchResponse> {
  const python = process.env.MUZIK_PYTHON ?? `${process.cwd()}/.venv/bin/python`;
  const script = `${process.cwd()}/scripts/search_music.py`;
  const { stdout } = await exec(python, [script, query], {
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout) as SearchResponse;
}
