import assert from "node:assert/strict";
import test from "node:test";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { connect } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamProxy, fetchStream } from "../lib/stream-proxy.ts";
import { extractionArguments, streamClients } from "../lib/stream.ts";

const exec = promisify(execFile);
function environment(t) {
  const names = ["MUZIK_STREAM_PROXY_URL", "MUZIK_VPN_CONTAINER", "MUZIK_PO_TOKEN_BASE_URL"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  t.after(() => { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } });
}
function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

test("VPN configuration fails closed and extraction uses the same proxy with an explicit client", (t) => {
  environment(t);
  assert.equal(streamProxy(), null);
  assert.deepEqual(streamClients(), ["android_vr", "web_embedded"]);
  process.env.MUZIK_VPN_CONTAINER = "gluetun";
  assert.throws(() => streamProxy(), /not configured/);
  process.env.MUZIK_STREAM_PROXY_URL = "http://user:password@127.0.0.1:8888";
  process.env.MUZIK_PO_TOKEN_BASE_URL = "http://127.0.0.1:4416";
  assert.deepEqual(streamClients(), ["web_music", "mweb", "android_vr", "web_embedded"]);
  const args = extractionArguments("abcdefghijk", "mweb");
  assert.equal(args[args.indexOf("--proxy") + 1], "http://user:password@127.0.0.1:8888/");
  assert.ok(args.includes("youtube:player_client=mweb"));
  assert.ok(extractionArguments("VrN6EDxTOIU", streamClients()[0]).includes("youtube:player_client=web_music"));
  assert.ok(args.includes("youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"));
  assert.throws(() => extractionArguments("bad", "mweb"));
  assert.throws(() => extractionArguments("abcdefghijk", "not-a-client"));
  for (const value of ["https://proxy.example", "http://proxy.example/path", "http://proxy.example/?secret=x"]) {
    process.env.MUZIK_STREAM_PROXY_URL = value;
    assert.throws(() => streamProxy());
  }
});

test("proxy refusal never falls back to a direct connection or leaks credentials", async (t) => {
  environment(t);
  let calls = 0;
  const server = httpServer();
  server.on("connect", (_request, socket) => { calls += 1; socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n"); });
  const port = await listen(server);
  t.after(() => server.close());
  process.env.MUZIK_STREAM_PROXY_URL = `http://private-user:private-password@127.0.0.1:${port}`;
  await assert.rejects(fetchStream("https://never-resolve.invalid/audio", { method: "GET", signal: AbortSignal.timeout(3000) }), (error) => {
    assert.match(error.message, /proxy refused/);
    assert.equal(error.message.includes("private-"), false);
    return true;
  });
  assert.equal(calls, 1);
});

test("CONNECT transport verifies TLS, keeps proxy credentials off the origin, and forwards byte ranges", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "muzik-proxy-tls-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-days", "1"]);
  const sockets = new Set();
  const track = (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); };
  let originHeaders, proxyHeaders;
  const origin = httpsServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    originHeaders = request.headers;
    response.writeHead(206, { "Content-Type": "audio/mp4", "Content-Length": "3", "Content-Range": "bytes 2-4/9" });
    response.end("abc");
  });
  origin.on("connection", track);
  const originPort = await listen(origin);
  const proxy = httpServer();
  proxy.on("connection", track);
  proxy.on("connect", (request, downstream, head) => {
    proxyHeaders = request.headers;
    assert.equal(request.url, `localhost:${originPort}`);
    const upstream = connect(originPort, "127.0.0.1", () => {
      downstream.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      downstream.pipe(upstream).pipe(downstream);
    });
    track(upstream);
    upstream.on("error", () => downstream.destroy());
    downstream.on("close", () => upstream.destroy());
  });
  const proxyPort = await listen(proxy);
  t.after(async () => { for (const socket of sockets) socket.destroy(); origin.close(); proxy.close(); await rm(directory, { recursive: true, force: true }); });
  const source = new URL("../lib/stream-proxy.ts", import.meta.url).href;
  const script = `const {fetchStream}=await import(${JSON.stringify(source)});const r=await fetchStream("https://localhost:${originPort}/audio",{method:"GET",headers:{Range:"bytes=2-4"},signal:AbortSignal.timeout(5000)});console.log(JSON.stringify({status:r.status,body:await r.text(),range:r.headers.get("content-range")}));`;
  const env = { ...process.env, MUZIK_STREAM_PROXY_URL: `http://test:only@127.0.0.1:${proxyPort}`, NODE_EXTRA_CA_CERTS: cert };
  const { stdout } = await exec(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { env, timeout: 10_000 });
  assert.deepEqual(JSON.parse(stdout), { status: 206, body: "abc", range: "bytes 2-4/9" });
  assert.equal(proxyHeaders["proxy-authorization"], `Basic ${Buffer.from("test:only").toString("base64")}`);
  assert.equal(originHeaders["proxy-authorization"], undefined);
  assert.equal(originHeaders.range, "bytes=2-4");
  // The same untrusted certificate must fail when the test CA is not installed.
  const untrusted = { ...env }; delete untrusted.NODE_EXTRA_CA_CERTS;
  await assert.rejects(exec(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { env: untrusted, timeout: 10_000 }));
});
