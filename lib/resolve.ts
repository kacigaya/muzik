import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { ParsedLink } from "./link.ts";
import { externalUrl } from "./sources.ts";
import type { SearchItem, SearchKind } from "./types.ts";

const exec = promisify(execFile);

type DumpedEntry = {
  id?: string;
  title?: string;
  uploader?: string;
  artist?: string;
  album?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  _type?: string;
  entries?: DumpedEntry[];
};

function externalId(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function httpsThumbnail(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Sources outside YouTube Music have no catalogue API here, so yt-dlp itself describes
 * the link. `--flat-playlist` keeps a large set cheap: one metadata request, no per-track
 * extraction.
 */
export async function resolveExternal(url: string): Promise<SearchItem[]> {
  const ytDlp = process.env.MUZIK_YTDLP ?? `${process.cwd()}/.venv/bin/yt-dlp`;
  const { stdout } = await exec(
    ytDlp,
    ["--dump-single-json", "--flat-playlist", "--no-warnings", "--socket-timeout", "15", url],
    { timeout: 45_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as DumpedEntry;
  // yt-dlp can report a redirect target, which has to stay inside the allowlist too.
  const canonical = (data.webpage_url && externalUrl(data.webpage_url)) || url;
  const collection = data._type === "playlist" || Array.isArray(data.entries);
  const artist = data.artist ?? data.uploader ?? "Unknown artist";
  return [{
    kind: collection ? "playlist" : "song",
    sourceId: externalId(canonical),
    url: canonical,
    title: data.title ?? "Unknown title",
    subtitle: collection ? artist : data.album ? `${artist} · ${data.album}` : artist,
    artist,
    album: collection ? null : data.album ?? null,
    thumbnail: httpsThumbnail(data.thumbnail),
    durationSeconds: collection ? null : Math.round(data.duration ?? 0) || null,
    trackNumber: null,
    itemCount: collection ? data.entries?.length ?? null : null,
  }];
}

export async function resolveSourceItem(
  kind: SearchKind,
  sourceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<SearchItem> {
  const python = process.env.MUZIK_PYTHON ?? `${process.cwd()}/.venv/bin/python`;
  const script = `${process.cwd()}/scripts/search_music.py`;
  const { stdout } = await exec(python, [script, "resolve", kind, sourceId], {
    timeout: 20_000,
    signal: options.signal,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout) as SearchItem;
}

export async function resolveLink(parsed: ParsedLink): Promise<SearchItem[]> {
  const targets: Array<Promise<SearchItem>> = [];
  if (parsed.videoId) targets.push(resolveSourceItem("song", parsed.videoId));
  if (parsed.listId && parsed.listKind) targets.push(resolveSourceItem(parsed.listKind, parsed.listId));
  const settled = await Promise.allSettled(targets);
  const items = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);
  if (!items.length) {
    const failure = settled.find((entry) => entry.status === "rejected");
    throw failure && failure.reason instanceof Error ? failure.reason : new Error("Could not resolve this link.");
  }
  return items;
}
