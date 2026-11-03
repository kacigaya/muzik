import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAudioSource, resolveAudio, streamAudio, validAudioRange, validateAudioUrl } from "../lib/stream.ts";

const url = "https://rr1---sn.example.googlevideo.com/videoplayback?expire=9999999999";
const source = { url, type: "audio/mp4", expires: Date.now() + 10000 };
const request = (options = {}, query = "abcdefghijk") => new Request(`http://muzik/api/audio?id=${query}`, options);

test("audio resolution accepts only progressive audio on HTTPS Google media hosts", () => {
  assert.equal(validateAudioUrl(url), url);
  for (const bad of ["http://rr.googlevideo.com/audio", "https://googlevideo.com.evil.example/x", "https://localhost/x", "https://rr.googlevideo.com:8443/x", "https://user:pass@rr.googlevideo.com/x", "file:///etc/passwd"]) assert.throws(() => validateAudioUrl(bad));
  assert.equal(parseAudioSource({ url, protocol: "https", ext: "m4a", vcodec: "none" }).type, "audio/mp4");
  for (const data of [{ protocol: "m3u8_native" }, { ext: "mp4" }, { vcodec: "h264" }]) assert.throws(() => parseAudioSource({ url, protocol: "https", ext: "m4a", vcodec: "none", ...data }));
});

test("byte ranges allow seeking but reject multiple ranges and header injection", () => {
  for (const value of ["bytes=0-", "bytes=10-99", "bytes=-500"]) assert.equal(validAudioRange(value), true);
  for (const value of ["bytes=0-1,2-3", "bytes=-", "bytes=0-\r\nx: y", "other=1-2"]) assert.equal(validAudioRange(value), false);
});

test("proxy forwards ranges and safe response headers while streaming the body", async () => {
  const response = await streamAudio(request({ headers: { range: "bytes=2-4", Cookie: "secret", Authorization: "secret" } }), async () => source, async (target, init) => {
    assert.equal(target, url);
    assert.deepEqual(init.headers, { Range: "bytes=2-4" });
    assert.equal(init.redirect, "error");
    return new Response("abc", { status: 206, headers: { "Content-Range": "bytes 2-4/9", "Content-Length": "3", "Set-Cookie": "upstream=secret" } });
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 2-4/9");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "abc");
});

test("proxy refreshes expired URLs once, handles HEAD and 416, and hides upstream errors", async () => {
  const refreshes = [];
  let calls = 0;
  const response = await streamAudio(request(), async (_id, refresh) => { refreshes.push(Boolean(refresh)); return source; }, async () => ++calls === 1 ? new Response("expired", { status: 403 }) : new Response("ok"));
  assert.deepEqual(refreshes, [false, true]);
  assert.equal(await response.text(), "ok");
  const head = await streamAudio(request({ method: "HEAD" }), async () => source, async (_url, init) => { assert.equal(init.method, "HEAD"); return new Response(null, { headers: { "Content-Length": "42" } }); });
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-length"), "42");
  const invalid = await streamAudio(request({ headers: { range: "bytes=999-" } }), async () => source, async () => new Response(null, { status: 416, headers: { "Content-Range": "bytes */99" } }));
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */99");
  const failed = await streamAudio(request(), async () => { throw new Error("secret CDN URL"); });
  assert.equal(failed.status, 502);
  assert.equal((await failed.text()).includes("secret"), false);
});

test("invalid IDs and ranges do not invoke the resolver", async () => {
  const resolve = async () => { assert.fail("must not resolve"); };
  assert.equal((await streamAudio(request({}, "bad"), resolve)).status, 400);
  assert.equal((await streamAudio(request({ headers: { range: "bytes=0-1,3-4" } }), resolve)).status, 416);
});


test("resolver supplies Node for YouTube challenges, shares extraction, and caches only resolved audio", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "muzik-audio-resolver-"));
  const binary = join(directory, "yt-dlp");
  const calls = join(directory, "calls");
  await writeFile(binary, `#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const args = process.argv.slice(2);
assert.ok(args.includes("--ignore-config"));
assert.equal(args[args.indexOf("--js-runtimes") + 1], "node:" + process.execPath);
assert.equal(args.at(-1), "https://music.youtube.com/watch?v=testaudio01");
fs.appendFileSync(${JSON.stringify(calls)}, "x");
process.stdout.write(JSON.stringify({url: ${JSON.stringify(url)}, protocol:"https", ext:"m4a", vcodec:"none"}));
`, { mode: 0o700 });
  const original = process.env.MUZIK_YTDLP;
  process.env.MUZIK_YTDLP = binary;
  t.after(async () => {
    if (original === undefined) delete process.env.MUZIK_YTDLP; else process.env.MUZIK_YTDLP = original;
    await rm(directory, { recursive: true, force: true });
  });
  const results = await Promise.all([resolveAudio("testaudio01"), resolveAudio("testaudio01")]);
  assert.equal(results[0].url, url);
  await resolveAudio("testaudio01");
  assert.equal(await readFile(calls, "utf8"), "x");
  await resolveAudio("testaudio01", true);
  assert.equal(await readFile(calls, "utf8"), "xx");
});
