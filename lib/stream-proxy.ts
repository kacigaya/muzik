import { request as httpRequest } from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { connect, type TLSSocket } from "node:tls";

export function streamProxy(): string | null {
  const configured = process.env.MUZIK_STREAM_PROXY_URL?.trim();
  if (!configured) {
    if (process.env.MUZIK_VPN_CONTAINER?.trim()) throw new Error("Streaming VPN proxy is not configured.");
    return null;
  }
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("Streaming proxy URL is invalid."); }
  if (url.protocol !== "http:" || url.pathname !== "/" || url.search || url.hash) throw new Error("Streaming proxy must be an HTTP proxy address.");
  return url.href;
}

function tunnel(target: URL, proxy: URL, signal?: AbortSignal): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const destination = `${target.hostname}:${target.port || "443"}`;
    const headers: Record<string, string> = { Host: destination };
    if (proxy.username || proxy.password) headers["Proxy-Authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`;
    const request = httpRequest({ hostname: proxy.hostname, port: proxy.port || 80, method: "CONNECT", path: destination, headers, agent: false });
    let secured: TLSSocket | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) { request.destroy(); secured?.destroy(); reject(error); }
      else if (secured) resolve(secured);
    };
    const abort = () => finish(new Error("Streaming request was cancelled."));
    const timer = setTimeout(() => finish(new Error("Streaming proxy connection timed out.")), 15_000);
    signal?.addEventListener("abort", abort, { once: true });
    request.on("connect", (response, socket, head) => {
      if (response.statusCode !== 200) { socket.destroy(); finish(new Error("Streaming proxy refused the connection.")); return; }
      if (head.length) socket.unshift(head);
      secured = connect({ socket, servername: target.hostname, rejectUnauthorized: true });
      secured.once("secureConnect", () => finish());
      secured.on("error", () => finish(new Error("Streaming proxy TLS connection failed.")));
    });
    request.on("error", () => finish(new Error("Streaming proxy connection failed.")));
    request.end();
  });
}

// The extraction process and the media request use the same proxy and VPN exit IP.
export async function fetchStream(url: string, init: RequestInit): Promise<Response> {
  const proxy = streamProxy();
  if (!proxy) return fetch(url, init);
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("Streaming requires HTTPS.");
  const socket = await tunnel(target, new URL(proxy), init.signal ?? undefined);
  const agent = new Agent({ keepAlive: false, maxSockets: 1 });
  agent.createConnection = () => socket;
  return new Promise((resolve, reject) => {
    const request = httpsRequest(target, {
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      agent,
      signal: init.signal ?? undefined,
    }, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      response.once("close", () => agent.destroy());
      // IncomingMessage emits Buffer chunks; Node's adapter preserves backpressure and cancellation.
      const body = Readable.toWeb(response, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>;
      resolve(new Response(init.method === "HEAD" ? null : body, { status: response.statusCode ?? 502, headers }));
      if (init.method === "HEAD") response.resume();
    });
    request.once("error", () => { agent.destroy(); socket.destroy(); reject(new Error("Streaming VPN request failed.")); });
    request.end();
  });
}
