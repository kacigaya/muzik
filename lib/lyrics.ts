import { execFile } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const LRCLIB_URL = "https://lrclib.net/api/get";

type Track = { artist: string; title: string; album: string; durationSeconds: number };

/** Off by default: it sends artist and track names to a third-party service. */
export function lyricsEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.MUZIK_LYRICS ?? "");
}

function lyricsPath(file: string) {
  return `${file.slice(0, -extname(file).length)}.lrc`;
}

async function readTrack(file: string): Promise<Track | null> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:format_tags=artist,title,album",
    "-of", "json",
    file,
  ]);
  const format = JSON.parse(stdout).format ?? {};
  const tags = Object.fromEntries(
    Object.entries((format.tags ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  if (!tags.artist || !tags.title) return null;
  return {
    artist: tags.artist,
    title: tags.title,
    album: tags.album ?? "",
    durationSeconds: Math.round(Number(format.duration) || 0),
  };
}

async function lookup(track: Track) {
  const query = new URLSearchParams({
    artist_name: track.artist,
    track_name: track.title,
    album_name: track.album,
    duration: String(track.durationSeconds),
  });
  const response = await fetch(`${LRCLIB_URL}?${query}`, {
    headers: { Accept: "application/json", "User-Agent": "Muzik (https://github.com/kacigaya/muzik)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const data = await response.json() as { syncedLyrics?: string | null; plainLyrics?: string | null };
  return data.syncedLyrics || data.plainLyrics || null;
}

/**
 * Writes an .lrc next to each downloaded track. Every failure is swallowed: missing
 * lyrics are normal, and a download that already succeeded should not be reported as
 * broken because a lyrics server was unreachable.
 */
export async function fetchLyrics(files: string[]) {
  if (!lyricsEnabled()) return 0;
  let written = 0;
  for (const file of files) {
    const target = lyricsPath(file);
    try {
      await access(target);
      continue;
    } catch { /* no lyrics stored yet */ }
    try {
      const track = await readTrack(file);
      if (!track) continue;
      const lyrics = await lookup(track);
      if (!lyrics) continue;
      await writeFile(target, lyrics.endsWith("\n") ? lyrics : `${lyrics}\n`);
      written += 1;
    } catch { /* lyrics stay optional */ }
  }
  return written;
}
