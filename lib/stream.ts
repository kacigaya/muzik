import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VIDEO_ID } from "./source-ids.ts";
import { fetchStream, streamProxy } from "./stream-proxy.ts";

const exec = promisify(execFile);
type AudioSource = { url: string; type: string; expires: number; headers?: Record<string, string>; clientIndex?: number };
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
  const headers: Record<string, string> = {};
  if (data.http_headers && typeof data.http_headers === "object") {
    for (const [name, value] of Object.entries(data.http_headers)) {
      if (!["user-agent", "origin", "referer", "accept-language"].includes(name.toLowerCase())) continue;
      if (typeof value !== "string" || value.length > 1000 || /[\r\n]/.test(value)) throw new Error("Invalid source header.");
      if (["origin", "referer"].includes(name.toLowerCase())) {
        const origin = new URL(value);
        if (origin.protocol !== "https:" || !["www.youtube.com", "music.youtube.com", "m.youtube.com"].includes(origin.hostname) || origin.username || origin.password) throw new Error("Invalid source origin.");
      }
      headers[name] = value;
    }
  }
  return {
    url,
    headers,
    type: data.ext === "m4a" ? "audio/mp4" : "audio/webm",
    expires: Math.min(Date.now() + 5 * 60_000, expiry > 0 ? expiry - 60_000 : Infinity),
  };
}

export function streamClients(): string[] {
  return process.env.MUZIK_PO_TOKEN_BASE_URL?.trim()
    ? ["web_music", "mweb", "android_vr", "web_embedded"]
    : ["android_vr", "web_embedded"];
}

export function extractionArguments(id: string, client: string): string[] {
  if (!VIDEO_ID.test(id) || !["web_music", "mweb", "android_vr", "web_embedded"].includes(client)) throw new Error("Invalid audio source.");
  const proxy = streamProxy();
  const provider = process.env.MUZIK_PO_TOKEN_BASE_URL?.trim();
  const args = [
    "--ignore-config", "--no-playlist", "--no-warnings", "--skip-download", "--dump-single-json",
    "--socket-timeout", "10", "--retries", "0",
    "--js-runtimes", `node:${process.execPath}`,
    "--extractor-args", `youtube:player_client=${client}`,
    // An empty proxy value also prevents yt-dlp from silently inheriting a different proxy.
    "--proxy", proxy ?? "",
  ];
  if (provider) {
    const url = new URL(provider);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid token provider URL.");
    args.push("--extractor-args", `youtubepot-bgutilhttp:base_url=${url.origin}`);
  }
  return [...args, "-f", "bestaudio[ext=m4a][protocol=https]/bestaudio[ext=webm][protocol=https]", `https://music.youtube.com/watch?v=${id}`];
}

export async function resolveAudio(id: string, refresh = false): Promise<AudioSource> {
  if (!VIDEO_ID.test(id)) throw new Error("Invalid video ID.");
  streamProxy();
  const cached = sources.get(id);
  if (!refresh && cached && cached.expires > Date.now()) return cached;
  const existing = pending.get(id);
  if (existing) return existing;
  if (pending.size >= 4) throw new Error("Audio resolver is busy.");
  const clients = streamClients();
  const start = refresh ? (cached?.clientIndex ?? -1) + 1 : 0;
  const work = (async () => {
    for (let index = start; index < clients.length; index += 1) {
      try {
        const { stdout } = await exec(process.env.MUZIK_YTDLP ?? `${process.cwd()}/.venv/bin/yt-dlp`, extractionArguments(id, clients[index]), {
          timeout: 25_000, maxBuffer: 2 * 1024 * 1024,
        });
        const audio = { ...parseAudioSource(JSON.parse(stdout)), clientIndex: index };
        if (sources.size >= 64) sources.delete(sources.keys().next().value!);
        sources.set(id, audio);
        return audio;
      } catch {
        console.warn(`[stream] ${clients[index]} could not resolve audio; trying the next client.`);
      }
    }
    sources.delete(id);
    throw new Error("No YouTube client could resolve this track.");
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
  fetchAudio: (url: string, init: RequestInit) => Promise<Response> = fetchStream,
): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID.test(id)) return Response.json({ error: "Invalid video ID." }, { status: 400 });
  const range = request.headers.get("range");
  if (range && !validAudioRange(range)) return Response.json({ error: "Invalid byte range." }, { status: 416 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    let source = await resolve(id);
    const load = () => fetchAudio(validateAudioUrl(source.url), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: { ...source.headers, ...(range ? { Range: range } : {}) },
      redirect: "error",
      signal: AbortSignal.any([request.signal, controller.signal]),
    });
    let upstream = await load();
    for (let attempt = 1; attempt < streamClients().length && [403, 404, 410, 429].includes(upstream.status); attempt += 1) {
      console.warn(`[stream] Media request refused (${upstream.status}); trying another client.`);
      await upstream.body?.cancel();
      source = await resolve(id, true);
      upstream = await load();
    }
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      sources.delete(id);
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
