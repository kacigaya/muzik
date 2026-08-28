import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { USER_AGENT } from "./user-agent.ts";

const exec = promisify(execFile);
const AUDIO_EXTENSIONS = new Set([".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"]);
const MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2/artist/";
const MUSICBRAINZ_DELAY_MS = 1_000;
let lastMusicBrainzRequest = 0;

type MusicBrainzTag = { name?: string; count?: number };
type ProbeTags = Record<string, string>;
type OrganizedResult = { modified: number; other: number; warnings: string[] };

const GENRE_RULES: [RegExp, string][] = [
  [/metal|metalcore|deathcore|grindcore/, "Metal"],
  [/hip[ -]?hop|rap|trap|drill/, "Hip-Hop"],
  [/punk|hardcore/, "Punk"],
  [/rock|grunge|shoegaze|indie|emo/, "Rock"],
  [/electro|techno|house|ambient|synthwave|dubstep|drum and bass/, "Electronic"],
  [/rhythm and blues|r&b|soul|funk/, "R&B"],
  [/pop/, "Pop"],
  [/jazz/, "Jazz"],
  [/classical|opera/, "Classical"],
  [/folk/, "Folk"],
  [/country/, "Country"],
  [/reggae|ska/, "Reggae"],
  [/blues/, "Blues"],
  [/latin|salsa|bachata|reggaeton/, "Latin"],
  [/soundtrack|score/, "Soundtrack"],
];

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

export function genreFromTags(tags: MusicBrainzTag[]) {
  const ranked = tags
    .filter((tag) => typeof tag.name === "string" && (tag.count ?? 0) > 0)
    .sort((left, right) => (right.count ?? 0) - (left.count ?? 0));
  for (const tag of ranked) {
    const match = GENRE_RULES.find(([pattern]) => pattern.test(normalized(tag.name!)));
    if (match) return match[1];
  }
  return "Other";
}

export function safeMusicPath(musicDir: string, value: string) {
  const root = resolve(musicDir);
  const candidate = resolve(isAbsolute(value) ? value : join(root, value));
  const local = relative(root, candidate);
  if (!local || local.startsWith("..") || isAbsolute(local)) return null;
  return candidate;
}

function mode(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
}

async function probe(file: string): Promise<ProbeTags> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", file]);
  const tags = (JSON.parse(stdout).format?.tags ?? {}) as Record<string, string>;
  return Object.fromEntries(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

async function readCache(file: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return {};
  }
}

async function writeCache(file: string, cache: Record<string, string>) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(cache, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}

async function queryArtist(artist: string) {
  const delay = MUSICBRAINZ_DELAY_MS - (Date.now() - lastMusicBrainzRequest);
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
  lastMusicBrainzRequest = Date.now();
  const query = new URLSearchParams({ query: `artist:\"${artist.replaceAll('"', "")}\"`, fmt: "json", limit: "5" });
  const response = await fetch(`${MUSICBRAINZ_URL}?${query}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}.`);
  const data = await response.json() as { artists?: { name?: string; score?: number; tags?: MusicBrainzTag[] }[] };
  return data.artists?.find((candidate) => candidate.score === 100 && normalized(candidate.name ?? "") === normalized(artist));
}

async function lookupGenre(artist: string, cacheFile: string) {
  const cache = await readCache(cacheFile);
  const key = normalized(artist);
  if (cache[key]) return { genre: cache[key], warning: null };
  try {
    let match = await queryArtist(artist);
    if (!match && artist.includes(",")) match = await queryArtist(artist.split(",", 1)[0]);
    const genre = genreFromTags(match?.tags ?? []);
    cache[key] = genre;
    await writeCache(cacheFile, cache);
    return { genre, warning: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "MusicBrainz lookup failed.";
    return { genre: "Other", warning: `${artist}: ${message}` };
  }
}

async function audioFiles(folder: string) {
  return (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => join(folder, entry.name));
}

async function rewrite(file: string, metadata: Record<string, string>) {
  const temporary = `${file}.muzik.tmp${extname(file)}`;
  const original = await stat(file);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-map", "0", "-map_metadata", "0", "-c", "copy"];
  for (const [key, value] of Object.entries(metadata)) args.push("-metadata", `${key}=${value}`);
  args.push(temporary);
  try {
    await exec("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
    await chmod(temporary, original.mode);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function organizeFiles(paths: string[], musicDir: string, dataDir: string): Promise<OrganizedResult> {
  const folders = new Set<string>();
  for (const value of paths) {
    const file = safeMusicPath(musicDir, value);
    if (file && AUDIO_EXTENSIONS.has(extname(file).toLowerCase())) folders.add(dirname(file));
  }
  const result: OrganizedResult = { modified: 0, other: 0, warnings: [] };
  const cacheFile = join(dataDir, "genre-cache.json");
  for (const folder of folders) {
    try {
      const files = await audioFiles(folder);
      const tagged = await Promise.all(files.map(async (file) => ({ file, tags: await probe(file) })));
      const artist = mode(tagged.map(({ tags }) => tags.artist)) || mode(tagged.map(({ tags }) => tags.album_artist));
      const years = tagged.map(({ tags }) => tags.date?.slice(0, 4)).filter((year) => /^\d{4}$/.test(year)).sort();
      const year = years[0] ?? "";
      const lookup = artist ? await lookupGenre(artist, cacheFile) : { genre: "Other", warning: "Missing artist metadata." };
      if (lookup.genre === "Other") result.other += files.length;
      if (lookup.warning) result.warnings.push(lookup.warning);
      for (const { file, tags } of tagged) {
        const metadata = { genre: lookup.genre, ...(artist && { album_artist: artist }), ...(year && { date: year }) };
        if (Object.entries(metadata).every(([key, value]) => tags[key] === value)) continue;
        await rewrite(file, metadata);
        result.modified += 1;
      }
    } catch (cause) {
      result.warnings.push(`${relative(musicDir, folder)}: ${cause instanceof Error ? cause.message : "Metadata update failed."}`);
    }
  }
  return result;
}

export async function organizeLibrary(musicDir: string, dataDir: string) {
  const paths: string[] = [];
  async function walk(folder: string) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) paths.push(path);
    }
  }
  await walk(musicDir);
  return { total: paths.length, ...await organizeFiles(paths, musicDir, dataDir) };
}
