import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ParsedLink } from "./link.ts";
import type { SearchItem, SearchKind } from "./types.ts";

const exec = promisify(execFile);

async function resolveOne(kind: SearchKind, sourceId: string): Promise<SearchItem> {
  const python = process.env.MUZIK_PYTHON ?? `${process.cwd()}/.venv/bin/python`;
  const script = `${process.cwd()}/scripts/search_music.py`;
  const { stdout } = await exec(python, [script, "resolve", kind, sourceId], {
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout) as SearchItem;
}

export async function resolveLink(parsed: ParsedLink): Promise<SearchItem[]> {
  const targets: Array<Promise<SearchItem>> = [];
  if (parsed.videoId) targets.push(resolveOne("song", parsed.videoId));
  if (parsed.listId && parsed.listKind) targets.push(resolveOne(parsed.listKind, parsed.listId));
  const settled = await Promise.allSettled(targets);
  const items = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);
  if (!items.length) {
    const failure = settled.find((entry) => entry.status === "rejected");
    throw failure && failure.reason instanceof Error ? failure.reason : new Error("Could not resolve this link.");
  }
  return items;
}
