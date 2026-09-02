/**
 * Server-only Qobuz catalog and file client. This module deliberately accepts only
 * credentials issued to the operator through environment variables. It never logs in,
 * scrapes a web bundle, or embeds shared application credentials.
 */
import { createHash } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { qobuzCdnHosts, qobuzStreamUrl } from "./sources.ts";
import { USER_AGENT } from "./user-agent.ts";

const QOBUZ_API = "https://www.qobuz.com/api.json/0.2/";
const REQUEST_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_FLAC_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SEARCH_LIMIT = 15;
const MAX_DURATION_DIFFERENCE_SECONDS = 8;

/** 27: 24-bit/192 kHz, 7: 24-bit/96 kHz, 6: 16-bit/44.1 kHz FLAC. */
export const QOBUZ_LOSSLESS_QUALITIES = [27, 7, 6] as const;
export type QobuzQuality = (typeof QOBUZ_LOSSLESS_QUALITIES)[number];

const DIACRITICS = /\p{M}+/gu;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const FEATURING_CLAUSE = /(?:\s*[[(])?\s*(?:feat\.?|ft\.?|featuring)\s+.*$/i;
const BRACKETED_NOISE = /[[(]\s*(?:official\s+)?(?:music\s+)?(?:audio|video|lyrics?|lyric video|visualizer|hd|4k)\s*[\])]/gi;
const TRAILING_NOISE = /\s*[-–—]\s*(?:official\s+)?(?:music\s+)?(?:audio|video|lyrics?|visualizer)\s*$/i;
const ARTIST_NOISE_WORDS = new Set(["the", "and", "feat", "ft", "featuring", "with", "x"]);
const PERFORMING_ROLES = new Set(["mainartist", "featuredartist", "performer", "vocal", "vocals", "vocalist", "singer"]);
const VARIANT_PATTERNS: [string, RegExp][] = [
  ["live", /\blive\b/],
  ["acoustic", /\bacoustic\b/],
  ["karaoke", /\bkaraoke\b/],
  ["instrumental", /\binstrumental\b/],
  ["tribute", /\btribute\b/],
  ["cover", /\bcover\b/],
  ["remix", /\bremix(?:ed)?\b/],
  ["mashup", /\bmash[ -]?up\b/],
  ["demo", /\bdemo\b/],
  ["slowed", /\bslowed\b/],
  ["reverb", /\breverb\b/],
  ["sped-up", /\bsped up\b/],
  ["nightcore", /\bnightcore\b/],
  ["radio-edit", /\bradio edit\b/],
  ["extended", /\bextended(?: version| mix)?\b/],
  ["remaster", /\bremaster(?:ed)?\b/],
  ["mono", /\bmono(?: version| mix)?\b/],
  ["stereo", /\bstereo(?: version| mix)?\b/],
];
const VARIANT_WORDS = /\b(?:live|acoustic|karaoke|instrumental|tribute|cover|remix(?:ed)?|mash up|demo|slowed|reverb|sped up|nightcore|radio edit|extended(?: version| mix)?|\d{4} remaster(?:ed)?|remaster(?:ed)?(?: \d{4})?|mono(?: version| mix)?|stereo(?: version| mix)?)\b/g;

export type LosslessTarget = {
  title: string;
  artist: string;
  album?: string | null;
  durationSeconds?: number | null;
  trackNumber?: number | null;
};

type QobuzImage = {
  thumbnail?: string;
  small?: string;
  large?: string;
  extralarge?: string;
  mega?: string;
};

export type QobuzTrack = {
  id?: number | string;
  title?: string;
  version?: string | null;
  duration?: number;
  track_number?: number;
  media_number?: number;
  copyright?: string;
  performer?: { name?: string };
  performers?: string;
  album?: {
    title?: string;
    artist?: { name?: string };
    image?: QobuzImage;
    release_date_original?: string;
    release_date_stream?: string;
  };
};

export type QobuzStream = {
  url: string;
  formatId: QobuzQuality;
  bitDepth: number;
  samplingRate: number;
  trackId: string;
  artist: string;
  albumArtist: string;
  album: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  releaseDate: string | null;
  copyright: string | null;
  artworkUrl: string | null;
};

type FetchLike = typeof fetch;

function credentials() {
  return {
    appId: process.env.MUZIK_QOBUZ_APP_ID?.trim() ?? "",
    appSecret: process.env.MUZIK_QOBUZ_APP_SECRET?.trim() ?? "",
    userAuthToken: process.env.MUZIK_QOBUZ_USER_AUTH_TOKEN?.trim() ?? "",
  };
}

export function qobuzEnabled() {
  const { appId, appSecret, userAuthToken } = credentials();
  return Boolean(appId && appSecret && userAuthToken && qobuzCdnHosts().length);
}

export function qobuzQuality(): QobuzQuality {
  const configured = Number(process.env.MUZIK_QOBUZ_QUALITY);
  return QOBUZ_LOSSLESS_QUALITIES.includes(configured as QobuzQuality) ? configured as QobuzQuality : 27;
}

export function qobuzQualityLadder(preferred: QobuzQuality = qobuzQuality()): QobuzQuality[] {
  const start = QOBUZ_LOSSLESS_QUALITIES.indexOf(preferred);
  return QOBUZ_LOSSLESS_QUALITIES.slice(start < 0 ? 0 : start);
}

export function signQobuzFileUrl(trackId: string | number, formatId: QobuzQuality, appSecret: string, timestampSeconds: number) {
  // Qobuz defines this wire signature as MD5. It is protocol compatibility, not
  // password storage or a general-purpose message authentication choice.
  const raw = `trackgetFileUrlformat_id${formatId}intentstreamtrack_id${trackId}${timestampSeconds}${appSecret}`;
  return {
    request_ts: timestampSeconds,
    request_sig: createHash("md5").update(raw).digest("hex"),
    track_id: String(trackId),
    format_id: String(formatId),
    intent: "stream",
  };
}

export function normalizeText(raw: string) {
  return raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanForSearch(raw: string) {
  return raw
    .replace(FEATURING_CLAUSE, " ")
    .replace(BRACKETED_NOISE, " ")
    .replace(TRAILING_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutArtistPrefix(raw: string, artist: string) {
  if (!artist.trim()) return raw;
  const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`^\\s*${escaped}\\s*[-–—:]\\s*`, "i"), "");
}

function normalizeTitle(raw: string, artist: string) {
  const normalized = normalizeText(cleanForSearch(withoutArtistPrefix(raw, artist)));
  const base = normalized.replace(VARIANT_WORDS, " ").replace(/\s+/g, " ").trim();
  return base || normalized;
}

export function identityVariants(raw: string, artist: string) {
  const normalized = normalizeText(withoutArtistPrefix(raw, artist));
  const variants = new Set(VARIANT_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name));
  const remasterYear = normalized.match(/\bremaster(?:ed)?(?: in)?\s+(\d{4})\b/)?.[1]
    ?? normalized.match(/\b(\d{4})\s+remaster(?:ed)?\b/)?.[1];
  if (remasterYear) variants.add(`remaster-year:${remasterYear}`);
  return variants;
}

function sameVariants(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function performingTokens(item: QobuzTrack) {
  const primary = [item.performer?.name ?? "", item.album?.artist?.name ?? ""].map(normalizeText).filter(Boolean);
  const credits = (item.performers ?? "")
    .split(/\s+-\s+/)
    .map(normalizeText)
    .filter((credit) => credit.split(" ").some((word) => PERFORMING_ROLES.has(word)));
  return { primary, tokens: new Set([...primary, ...credits].flatMap((value) => value.split(" ")).filter(Boolean)) };
}

function artistMatches(item: QobuzTrack, artist: string) {
  const target = normalizeText(artist);
  if (!target) return false;
  const { primary, tokens } = performingTokens(item);
  if (primary.includes(target)) return true;
  const wanted = target.split(" ").filter((word) => word && !ARTIST_NOISE_WORDS.has(word));
  if (!wanted.length) return false;
  if (primary.some((identity) => wanted.every((word) => identity.split(" ").includes(word)))) return true;
  return wanted.every((word) => tokens.has(word));
}

/** Every supplied identity field is a gate. Scoring only ranks already-valid matches. */
export function matchScore(item: QobuzTrack, target: LosslessTarget): number | null {
  const wanted = normalizeTitle(target.title, target.artist);
  if (!wanted || wanted !== normalizeTitle(item.title ?? "", target.artist)) return null;
  const candidateText = `${item.title ?? ""} ${item.version ?? ""}`;
  if (!sameVariants(identityVariants(target.title, target.artist), identityVariants(candidateText, target.artist))) return null;
  if (!artistMatches(item, target.artist)) return null;
  if (target.album?.trim() && normalizeTitle(target.album, "") !== normalizeTitle(item.album?.title ?? "", "")) return null;
  if (target.trackNumber && target.trackNumber > 0 && item.track_number !== target.trackNumber) return null;

  let difference: number | null = null;
  if (target.durationSeconds && target.durationSeconds > 0) {
    if (!item.duration || item.duration <= 0) return null;
    difference = Math.abs(item.duration - target.durationSeconds);
    if (difference > MAX_DURATION_DIFFERENCE_SECONDS) return null;
  }

  let score = 1_000;
  const artist = normalizeText(target.artist);
  if ([item.performer?.name ?? "", item.album?.artist?.name ?? ""].some((name) => normalizeText(name) === artist)) score += 300;
  if (target.album?.trim()) score += 120;
  if (target.trackNumber) score += 60;
  if (difference !== null) score += (MAX_DURATION_DIFFERENCE_SECONDS - difference) * 10;
  return score;
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

async function qobuzJson(endpoint: string, params: Record<string, string | number>, signal: AbortSignal | undefined, fetchImpl: FetchLike) {
  const { appId, userAuthToken } = credentials();
  const url = new URL(endpoint, QOBUZ_API);
  for (const [key, value] of Object.entries({ ...params, app_id: appId })) url.searchParams.set(key, String(value));
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      "X-App-Id": appId,
      "X-User-Auth-Token": userAuthToken,
    },
    signal: combinedSignal(signal, REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Qobuz returned HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

async function bestMatch(target: LosslessTarget, signal: AbortSignal | undefined, fetchImpl: FetchLike) {
  const title = cleanForSearch(target.title);
  const artist = cleanForSearch(target.artist);
  const queries = [...new Set([`${title} ${artist}`, `${artist} ${title}`, title, target.title].map((value) => value.trim()).filter(Boolean))];
  for (const query of queries) {
    const body = await qobuzJson("track/search", { query, limit: SEARCH_LIMIT, offset: 0 }, signal, fetchImpl) as {
      tracks?: { items?: QobuzTrack[] };
    };
    let best: QobuzTrack | null = null;
    let bestScore = -1;
    for (const item of body.tracks?.items ?? []) {
      const score = matchScore(item, target);
      if (score !== null && score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    if (best) return best;
  }
  return null;
}

export function qobuzArtworkUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "static.qobuz.com" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Artwork is small and optional, but receives the same bounded, redirect-safe treatment. */
export async function downloadQobuzArtwork(
  artworkUrl: string,
  destination: string,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike; maxBytes?: number } = {},
) {
  const maximum = options.maxBytes ?? 20 * 1024 * 1024;
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = combinedSignal(options.signal, REQUEST_TIMEOUT_MS);
  const allowedUrl = qobuzArtworkUrl(artworkUrl);
  if (!allowedUrl) throw new Error("Qobuz returned a disallowed artwork URL.");
  let url: string = allowedUrl;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    response = await fetchImpl(url, { redirect: "manual", signal, headers: { "User-Agent": USER_AGENT } });
    if (!isRedirect(response.status)) break;
    if (redirects === MAX_REDIRECTS) throw new Error("Qobuz artwork redirected too many times.");
    const location: string | null = response.headers.get("location");
    const redirected: string | null = location ? qobuzArtworkUrl(new URL(location, url).toString()) : null;
    if (!redirected) throw new Error("Qobuz artwork redirected outside its allowed host.");
    url = redirected;
  }
  if (!response?.ok || !response.body) throw new Error(`Qobuz artwork returned HTTP ${response?.status ?? 0}.`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error("Qobuz artwork exceeds the size limit.");
  await mkdir(dirname(destination), { recursive: true });
  const file = await open(destination, "w", 0o600);
  let bytes = 0;
  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new Error("Qobuz artwork exceeds the size limit.");
      await file.write(value);
    }
    await file.sync();
  } catch (cause) {
    await file.close();
    await rm(destination, { force: true });
    throw cause;
  }
  await file.close();
  return { bytes, finalUrl: url };
}

/** Returns null for disabled, unavailable, unauthorized, timed-out, or malformed results. */
export async function resolveQobuz(
  target: LosslessTarget,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<QobuzStream | null> {
  if (!qobuzEnabled() || !target.title.trim() || !target.artist.trim()) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const candidate = await bestMatch(target, options.signal, fetchImpl);
    if (candidate?.id == null) return null;
    const { appSecret } = credentials();
    for (const formatId of qobuzQualityLadder()) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const body = await qobuzJson(
          "track/getFileUrl",
          signQobuzFileUrl(candidate.id, formatId, appSecret, timestamp),
          options.signal,
          fetchImpl,
        ) as { url?: string; format_id?: number; mime_type?: string; bit_depth?: number; sampling_rate?: number };
        const returnedFormat = Number(body.format_id ?? formatId);
        if (returnedFormat !== formatId || !QOBUZ_LOSSLESS_QUALITIES.includes(returnedFormat as QobuzQuality)) continue;
        if (body.mime_type && !body.mime_type.toLowerCase().includes("flac")) continue;
        const url = body.url && qobuzStreamUrl(body.url);
        if (!url) continue;
        const artist = candidate.performer?.name || candidate.album?.artist?.name || target.artist;
        const albumArtist = candidate.album?.artist?.name || artist;
        const image = candidate.album?.image;
        return {
          url,
          formatId: returnedFormat as QobuzQuality,
          bitDepth: Number(body.bit_depth) > 0 ? Number(body.bit_depth) : 16,
          samplingRate: Number(body.sampling_rate) > 0 ? Number(body.sampling_rate) : 44.1,
          trackId: String(candidate.id),
          artist,
          albumArtist,
          album: candidate.album?.title || target.album || "Singles",
          title: candidate.title || target.title,
          trackNumber: Number.isInteger(candidate.track_number) ? candidate.track_number! : target.trackNumber ?? null,
          discNumber: Number.isInteger(candidate.media_number) ? candidate.media_number! : null,
          durationSeconds: Number(candidate.duration) > 0 ? Number(candidate.duration) : target.durationSeconds ?? null,
          releaseDate: candidate.album?.release_date_original || candidate.album?.release_date_stream || null,
          copyright: candidate.copyright || null,
          artworkUrl: qobuzArtworkUrl(image?.mega || image?.extralarge || image?.large),
        };
      } catch (cause) {
        if (options.signal?.aborted) throw cause;
      }
    }
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
  }
  return null;
}

export function hasFlacSignature(value: Uint8Array) {
  return value.length >= 4 && value[0] === 0x66 && value[1] === 0x4c && value[2] === 0x61 && value[3] === 0x43;
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Downloads a bounded FLAC to scratch. Every redirect remains inside the CDN allowlist. */
export async function downloadQobuzFlac(
  streamUrl: string,
  destination: string,
  options: {
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
    maxBytes?: number;
    timeoutMs?: number;
    onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
  } = {},
) {
  const temporary = `${destination}.part`;
  const maximum = options.maxBytes ?? MAX_FLAC_BYTES;
  const signal = combinedSignal(options.signal, options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  await mkdir(dirname(destination), { recursive: true });
  await rm(temporary, { force: true });
  const allowedUrl = qobuzStreamUrl(streamUrl);
  if (!allowedUrl) throw new Error("Qobuz returned a disallowed stream URL.");
  let url: string = allowedUrl;
  try {
    let response: Response | null = null;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      response = await fetchImpl(url, {
        headers: { Accept: "audio/flac", "User-Agent": USER_AGENT },
        redirect: "manual",
        signal,
      });
      if (!isRedirect(response.status)) break;
      if (redirects === MAX_REDIRECTS) throw new Error("Qobuz stream redirected too many times.");
      const location: string | null = response.headers.get("location");
      const redirected: string | null = location ? qobuzStreamUrl(new URL(location, url).toString()) : null;
      if (!redirected) throw new Error("Qobuz stream redirected outside the CDN allowlist.");
      url = redirected;
    }
    if (!response?.ok || !response.body) throw new Error(`Qobuz stream returned HTTP ${response?.status ?? 0}.`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximum) throw new Error("Qobuz FLAC exceeds the download size limit.");
    const total = Number.isFinite(declared) && declared > 0 ? declared : null;

    const file = await open(temporary, "wx", 0o600);
    let bytes = 0;
    let prefix = new Uint8Array();
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) throw signal.reason;
        bytes += value.byteLength;
        if (bytes > maximum) throw new Error("Qobuz FLAC exceeds the download size limit.");
        options.onProgress?.(bytes, total);
        if (prefix.length < 4) {
          const combined = new Uint8Array(prefix.length + value.length);
          combined.set(prefix);
          combined.set(value, prefix.length);
          prefix = combined;
          if (prefix.length < 4) continue;
          if (!hasFlacSignature(prefix)) throw new Error("Qobuz returned a non-FLAC payload.");
          await file.write(prefix);
        } else {
          await file.write(value);
        }
      }
      if (!hasFlacSignature(prefix)) throw new Error("Qobuz returned an incomplete FLAC payload.");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
    return { bytes, finalUrl: url };
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  }
}

export function safeComponent(value: string, fallback: string) {
  const cleaned = value
    .replace(/[/\\:*?"<>|%]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

export function losslessRelativePath(stream: QobuzStream, sourceId: string) {
  const number = String(stream.trackNumber ?? 0).padStart(2, "0");
  const artist = safeComponent(stream.albumArtist || stream.artist, "Unknown Artist");
  const album = safeComponent(stream.album, "Singles");
  return `${artist}/${album}/${number} - ${safeComponent(stream.title, "Track")} [${sourceId}].flac`;
}
