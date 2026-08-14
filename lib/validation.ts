import { resolve } from "node:path";
import { externalUrl } from "./sources.ts";
import { AUDIO_FORMATS, type AudioFormat, type CreateJobRequest, type SearchKind } from "./types.ts";

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,200}$/;
// Sources outside YouTube Music are identified by the link, so their id is a digest of it.
export const EXTERNAL_ID = /^[a-f0-9]{16}$/;
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

export function validateFormat(value: unknown): AudioFormat {
  if (value == null) return defaultFormat();
  if (!AUDIO_FORMATS.includes(value as AudioFormat)) throw new Error("Audio format is unsupported.");
  return value as AudioFormat;
}

export function defaultFormat(): AudioFormat {
  const configured = process.env.MUZIK_AUDIO_FORMAT?.trim() as AudioFormat | undefined;
  return configured && AUDIO_FORMATS.includes(configured) ? configured : "m4a";
}

// The URL is handed to yt-dlp, so it is restricted to the sources Muzik supports rather
// than to any address the server happens to be able to reach.
export function validateSourceUrl(value: unknown): string {
  const text = boundedText(value, "Source URL", 1000);
  const url = externalUrl(text);
  if (!url) throw new Error("Source URL is not a supported music source.");
  return url;
}

export function validateJobRequest(value: unknown): CreateJobRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const body = value as Record<string, unknown>;
  if (!KINDS.has(body.kind as SearchKind)) throw new Error("Unsupported music type.");
  const kind = body.kind as SearchKind;
  const sourceId = boundedText(body.sourceId, "Source ID", 200);
  const url = body.url == null ? null : validateSourceUrl(body.url);
  const expected = url ? EXTERNAL_ID : kind === "song" ? VIDEO_ID : PLAYLIST_ID;
  if (!expected.test(sourceId)) throw new Error("Source ID is invalid.");
  const thumbnail = body.thumbnail == null ? null : boundedText(body.thumbnail, "Artwork URL", 1000);
  if (thumbnail) {
    const artwork = new URL(thumbnail);
    if (artwork.protocol !== "https:") throw new Error("Artwork URL is invalid.");
  }
  return {
    kind,
    sourceId,
    url,
    title: boundedText(body.title, "Title", 300),
    subtitle: boundedText(body.subtitle, "Subtitle", 300),
    thumbnail,
    format: validateFormat(body.format),
  };
}

export function validateSubscription(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid request.");
  const body = value as Record<string, unknown>;
  if (body.kind !== "album" && body.kind !== "playlist") {
    throw new Error("Only albums and playlists can be followed.");
  }
  const sourceId = boundedText(body.sourceId, "Source ID", 200);
  if (!PLAYLIST_ID.test(sourceId)) throw new Error("Source ID is invalid.");
  const hours = body.intervalHours == null ? 24 : Number(body.intervalHours);
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
    throw new Error("Check interval must be between 1 and 720 hours.");
  }
  const kind: Extract<SearchKind, "album" | "playlist"> = body.kind;
  const thumbnail = body.thumbnail == null ? null : boundedText(body.thumbnail, "Artwork URL", 1000);
  return {
    kind,
    sourceId,
    title: boundedText(body.title, "Title", 300),
    subtitle: boundedText(body.subtitle, "Subtitle", 300),
    thumbnail,
    format: validateFormat(body.format),
    intervalHours: Math.round(hours),
  };
}

/** Library paths arrive from the browser, so they stay relative and stay inside the root. */
export function validateLibraryPath(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error("Path is invalid.");
  const path = value.trim().replace(/^\/+/, "");
  if (path.length > 1000) throw new Error("Path is invalid.");
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new Error("Path is invalid.");
  if (path.split("/").includes("..")) throw new Error("Path is invalid.");
  return path;
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
