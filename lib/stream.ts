import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VIDEO_ID } from "./validation.ts";

const exec = promisify(execFile);
type AudioSource = { url: string; type: string; expires: number };
const state = globalThis as typeof globalThis & {
  muzikAudioSources?: Map<string, AudioSource>;
  muzikAudioPending?: Map<string, Promise<AudioSource>>;
};
const sources = state.muzikAudioSources ??= new Map();
const pending = state.muzikAudioPending ??= new Map();

export function validateAudioUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid audio URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googlevideo.com")
    || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Invalid audio URL.");
  }
  return url.href;
}

export function parseAudioSource(value: unknown): AudioSource {
  if (!value || typeof value !== "object") throw new Error("No playable audio.");
  const data = value as Record<string, unknown>;
  if (data.protocol !== "https" || data.vcodec !== "none" || !["m4a", "webm"].includes(String(data.ext))) {
    throw new Error("No progressive audio stream.");
  }
  const url = validateAudioUrl(data.url);
  const expiry = Number(new URL(url).searchParams.get("expire")) * 1000;
  return {
    url,
    type: data.ext === "m4a" ? "audio/mp4" : "audio/webm",
    expires: Math.min(Date.now() + 5 * 60_000, expiry > 0 ? expiry - 60_000 : Infinity),
  };
}

export async function resolveAudio(id: string, refresh = false): Promise<AudioSource> {
  if (!VIDEO_ID.test(id)) throw new Error("Invalid video ID.");
  const cached = sources.get(id);
  if (!refresh && cached && cached.expires > Date.now()) return cached;
  const existing = pending.get(id);
  if (existing) return existing;
  if (pending.size >= 4) throw new Error("Audio resolver is busy.");
  const work = (async () => {
    const { stdout } = await exec(process.env.MUZIK_YTDLP ?? `${process.cwd()}/.venv/bin/yt-dlp`, [
      "--ignore-config", "--no-playlist", "--no-warnings", "--skip-download", "--dump-single-json",
      "--socket-timeout", "15", "--retries", "1",
      "--js-runtimes", `node:${process.execPath}`,
      "-f", "bestaudio[ext=m4a][protocol=https]/bestaudio[ext=webm][protocol=https]",
      `https://music.youtube.com/watch?v=${id}`,
    ], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    const audio = parseAudioSource(JSON.parse(stdout));
    if (sources.size >= 64) sources.delete(sources.keys().next().value!);
    sources.set(id, audio);
    return audio;
  })();
  pending.set(id, work);
  try { return await work; } finally { pending.delete(id); }
}

export function validAudioRange(range: string): boolean {
  return /^bytes=(?:\d+-\d*|-\d+)$/.test(range) && range.length < 100;
}

// Only IDs enter the resolver. The proxy never accepts a caller-supplied destination or headers.
export async function streamAudio(
  request: Request,
  resolve = resolveAudio,
  fetchAudio: typeof fetch = fetch,
): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID.test(id)) return Response.json({ error: "Invalid video ID." }, { status: 400 });
  const range = request.headers.get("range");
  if (range && !validAudioRange(range)) return Response.json({ error: "Invalid byte range." }, { status: 416 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    let source = await resolve(id);
    const load = () => fetchAudio(validateAudioUrl(source.url), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: range ? { Range: range } : {},
      redirect: "error",
      signal: AbortSignal.any([request.signal, controller.signal]),
    });
    let upstream = await load();
    if (upstream.status === 403 || upstream.status === 410) {
      await upstream.body?.cancel();
      source = await resolve(id, true);
      upstream = await load();
    }
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      throw new Error("Audio source failed.");
    }
    const headers = new Headers({ "Content-Type": source.type, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes" });
    for (const name of ["Content-Length", "Content-Range"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (request.method === "HEAD") await upstream.body?.cancel();
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "Could not stream this track. YouTube may block this server or the track may be unavailable. Try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  } finally {
    // The deadline covers resolution and response headers, not the duration of the song.
    clearTimeout(timer);
  }
}
