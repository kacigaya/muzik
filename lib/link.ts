import { isExternalHost } from "./sources.ts";
import { PLAYLIST_ID, VIDEO_ID } from "./validation.ts";
import type { SearchKind } from "./types.ts";

const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const ALBUM_LIST_PREFIX = "OLAK5uy_";
const PRIVATE_LISTS = new Set(["WL", "LL", "LM"]);

export type ParsedLink = {
  videoId: string | null;
  listId: string | null;
  listKind: Extract<SearchKind, "album" | "playlist"> | null;
};

function parseUrl(value: string): URL | null {
  const text = value.trim();
  for (const candidate of [text, `https://${text}`]) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url;
    } catch { /* try with an https prefix */ }
  }
  return null;
}

function toUrl(value: string): URL | null {
  const url = parseUrl(value);
  return url && ALLOWED_HOSTS.has(url.hostname) ? url : null;
}

function cleanListId(value: string | null): string | null {
  const listId = (value ?? "").replace(/^VL/, "");
  if (!PLAYLIST_ID.test(listId)) return null;
  if (listId.startsWith("RD") || listId.startsWith("UL") || PRIVATE_LISTS.has(listId)) return null;
  return listId;
}

/** A link Muzik can resolve, from YouTube Music or one of the other supported sources. */
export function isMusicLink(value: string): boolean {
  const url = parseUrl(value);
  return Boolean(url && (ALLOWED_HOSTS.has(url.hostname) || isExternalHost(url.hostname)));
}

/** The link itself when it belongs to a source yt-dlp resolves directly. */
export function externalLink(value: string): string | null {
  const url = parseUrl(value);
  return url && isExternalHost(url.hostname) ? url.toString() : null;
}

export function parseMusicLink(value: string): ParsedLink | null {
  const url = toUrl(value);
  if (!url) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  let listId: string | null = null;
  if (url.hostname === "youtu.be") {
    videoId = segments[0] ?? null;
    listId = url.searchParams.get("list");
  } else if (segments[0] === "watch") {
    videoId = url.searchParams.get("v");
    listId = url.searchParams.get("list");
  } else if (segments[0] === "playlist") {
    listId = url.searchParams.get("list");
  } else if (segments[0] === "shorts" || segments[0] === "embed") {
    videoId = segments[1] ?? null;
  }
  if (videoId && !VIDEO_ID.test(videoId)) videoId = null;
  listId = cleanListId(listId);
  if (!videoId && !listId) return null;
  return {
    videoId,
    listId,
    listKind: listId ? (listId.startsWith(ALBUM_LIST_PREFIX) ? "album" : "playlist") : null,
  };
}
