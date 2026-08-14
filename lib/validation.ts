import { resolve } from "node:path";
import type { CreateJobRequest, SearchKind } from "./types.ts";

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,200}$/;
const KINDS = new Set<SearchKind>(["song", "album", "playlist"]);

export function validateQuery(value: unknown): string {
  if (typeof value !== "string") throw new Error("Search query is required.");
  const query = value.trim();
  if (query.length < 2 || query.length > 120) {
    throw new Error("Search query must be between 2 and 120 characters.");
  }
  return query;
}

export function validateLinkUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Link URL is required.");
  const url = value.trim();
  if (!url || url.length > 1000) throw new Error("Link URL is invalid.");
  return url;
}

function boundedText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${name} is required.`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${name} is invalid.`);
  return text;
}

export function validateJobRequest(value: unknown): CreateJobRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const body = value as Record<string, unknown>;
  if (!KINDS.has(body.kind as SearchKind)) throw new Error("Unsupported music type.");
  const kind = body.kind as SearchKind;
  const sourceId = boundedText(body.sourceId, "Source ID", 200);
  if (!(kind === "song" ? VIDEO_ID : PLAYLIST_ID).test(sourceId)) {
    throw new Error("Source ID is invalid.");
  }
  const thumbnail = body.thumbnail == null ? null : boundedText(body.thumbnail, "Artwork URL", 1000);
  if (thumbnail) {
    const url = new URL(thumbnail);
    if (url.protocol !== "https:") throw new Error("Artwork URL is invalid.");
  }
  return {
    kind,
    sourceId,
    title: boundedText(body.title, "Title", 300),
    subtitle: boundedText(body.subtitle, "Subtitle", 300),
    thumbnail,
  };
}

// The library path is an operator-level setting: it is only accepted while Muzik is
// unconfigured, and every download is confined to it afterwards by safeMusicPath.
export function validateMusicDir(value: unknown): string {
  if (typeof value !== "string") throw new Error("Music folder is required.");
  const path = value.trim();
  if (!path || path.length > 1000) throw new Error("Music folder is invalid.");
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new Error("Music folder is invalid.");
  if (!path.startsWith("/")) throw new Error("Music folder must be an absolute path.");
  const resolved = resolve(path);
  if (resolved === "/") throw new Error("Music folder cannot be the filesystem root.");
  return resolved;
}

export function validateJobId(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Job ID is invalid.");
  return value;
}
