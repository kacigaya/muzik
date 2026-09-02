import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { JobStore } from "../lib/jobs.ts";

const ENV_NAMES = [
  "MUZIK_MUSIC_DIR", "MUZIK_DATA_DIR", "MUZIK_TEMP_DIR", "MUZIK_YTDLP", "MUZIK_PYTHON",
  "MUZIK_MIN_FREE_MB", "MUZIK_LYRICS", "MUZIK_VPN_CONTAINER", "MUZIK_NAVIDROME_CONTAINER",
  "MUZIK_NAVIDROME_API_KEY", "MUZIK_NAVIDROME_USERNAME", "MUZIK_NAVIDROME_PASSWORD", "NAVIDROME_URL",
  "MUZIK_QOBUZ_APP_ID", "MUZIK_QOBUZ_APP_SECRET", "MUZIK_QOBUZ_USER_AUTH_TOKEN",
  "MUZIK_QOBUZ_QUALITY", "MUZIK_QOBUZ_CDN_HOSTS",
];

async function waitFor(store, id, accepted) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const job = (await store.list()).find((candidate) => candidate.id === id);
    if (job && accepted.includes(job.status)) return job;
    await sleep(20);
  }
  throw new Error(`Job ${id} did not reach ${accepted.join(" or ")}.`);
}

async function executable(path, source) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}

test("processes a mixed Qobuz and YouTube album, then skips its archived track", async (t) => {
  const musicRoot = await mkdtemp(join(tmpdir(), "muzik-lossless-music-"));
  const dataDir = await mkdtemp(join(tmpdir(), "muzik-lossless-data-"));
  const scratchRoot = await mkdtemp(join(tmpdir(), "muzik-lossless-tmp-"));
  const binDir = await mkdtemp(join(tmpdir(), "muzik-lossless-bin-"));
  const previousPath = process.env.PATH;
  const previousFetch = globalThis.fetch;

  const python = join(binDir, "python");
  await executable(python, `#!/bin/sh
printf '%s\n' '{"items":[{"kind":"song","sourceId":"aaaaaaaaaaa","title":"First","subtitle":"Artist · Album","artist":"Artist","album":"Album","thumbnail":null,"durationSeconds":180,"trackNumber":1,"itemCount":null},{"kind":"song","sourceId":"bbbbbbbbbbb","title":"Second","subtitle":"Artist · Album","artist":"Artist","album":"Album","thumbnail":null,"durationSeconds":200,"trackNumber":2,"itemCount":null}]}'
`);
  const ytDlp = join(binDir, "yt-dlp");
  await executable(ytDlp, `#!/bin/sh
music=""
archive=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    home:*) music="\${1#home:}" ;;
    --download-archive) shift; archive="$1" ;;
    http*) url="$1" ;;
  esac
  shift
done
id="\${url##*=}"
folder="$music/Artist/Album"
mkdir -p "$folder"
file="$folder/02 - Second [$id].m4a"
printf 'native-aac' > "$file"
printf 'youtube %s\n' "$id" >> "$archive"
printf 'muzik-file:%s\n' "$file"
`);
  await executable(join(binDir, "ffmpeg"), `#!/bin/sh
input=""
previous=""
last=""
for value in "$@"; do
  if [ "$previous" = "-i" ] && [ -z "$input" ]; then input="$value"; fi
  previous="$value"
  last="$value"
done
cp "$input" "$last"
`);
  await executable(join(binDir, "ffprobe"), `#!/bin/sh
case "$*" in
  *codec_name*) printf '%s\n' '{"streams":[{"codec_name":"flac","sample_rate":"96000","bits_per_raw_sample":"24"}]}' ;;
  *) printf '%s\n' '{"format":{"tags":{"genre":"Other"}}}' ;;
esac
`);

  Object.assign(process.env, {
    PATH: `${binDir}:${previousPath}`,
    MUZIK_MUSIC_DIR: musicRoot,
    MUZIK_DATA_DIR: dataDir,
    MUZIK_TEMP_DIR: scratchRoot,
    MUZIK_YTDLP: ytDlp,
    MUZIK_PYTHON: python,
    MUZIK_MIN_FREE_MB: "0",
    MUZIK_QOBUZ_APP_ID: "issued-app",
    MUZIK_QOBUZ_APP_SECRET: "issued-secret",
    MUZIK_QOBUZ_USER_AUTH_TOKEN: "entitled-user",
    MUZIK_QOBUZ_QUALITY: "27",
    MUZIK_QOBUZ_CDN_HOSTS: "cdn.qobuz.test",
  });
  for (const name of ["MUZIK_LYRICS", "MUZIK_VPN_CONTAINER", "MUZIK_NAVIDROME_CONTAINER", "NAVIDROME_URL"]) delete process.env[name];
  let cancelMatch = true;
  let blockCancelStream = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname === "cdn.qobuz.test") {
      if (url.pathname === "/cancel.flac" && blockCancelStream) {
        return new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      }
      return new Response(Uint8Array.from([0x66, 0x4c, 0x61, 0x43, 0, 1, 2, 3]));
    }
    if (url.pathname.endsWith("/track/search")) {
      const query = url.searchParams.get("query")?.toLowerCase() ?? "";
      const first = query.includes("first");
      const cancelling = cancelMatch && query.includes("cancel me");
      return Response.json({ tracks: { items: first || cancelling ? [{
        id: cancelling ? 202 : 101,
        title: cancelling ? "Cancel Me" : "First",
        duration: cancelling ? 210 : 180,
        track_number: cancelling ? 3 : 1,
        performer: { name: "Artist" },
        album: { title: "Album", artist: { name: "Artist" } },
      }] : [] } });
    }
    if (url.pathname.endsWith("/track/getFileUrl")) {
      const name = url.searchParams.get("track_id") === "202" ? "cancel" : "first";
      return Response.json({ url: `https://cdn.qobuz.test/${name}.flac`, format_id: 27, mime_type: "audio/flac", bit_depth: 24, sampling_rate: 96 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    process.env.PATH = previousPath;
    ENV_NAMES.forEach((name) => delete process.env[name]);
  });

  const store = new JobStore();
  const { job } = await store.create({
    kind: "album",
    sourceId: "OLAK5uy_example",
    url: null,
    title: "Album",
    subtitle: "Artist",
    artist: "Artist",
    album: "Album",
    thumbnail: null,
    durationSeconds: null,
    trackNumber: null,
    format: "lossless",
  });
  const finished = await waitFor(store, job.id, ["completed", "completed_with_warnings", "failed"]);
  assert.notEqual(finished.status, "failed", finished.error);
  assert.equal(finished.progress, 100);
  assert.equal(finished.itemCount, 2);
  assert.equal(finished.downloadedItems, 2);
  assert.equal(finished.qobuzItems, 1);
  assert.equal(finished.fallbackItems, 1);
  assert.equal(finished.skippedItems, 0);
  assert.equal((await readFile(join(musicRoot, "Artist/Album/01 - First [aaaaaaaaaaa].flac"))).subarray(0, 4).toString(), "fLaC");
  assert.equal((await readFile(join(musicRoot, "Artist/Album/02 - Second [bbbbbbbbbbb].m4a"), "utf8")), "native-aac");
  const archive = await readFile(join(dataDir, "downloaded.txt"), "utf8");
  assert.match(archive, /^youtube aaaaaaaaaaa$/m);
  assert.match(archive, /^youtube bbbbbbbbbbb$/m);

  const duplicate = await store.create({
    kind: "song",
    sourceId: "aaaaaaaaaaa",
    url: null,
    title: "First",
    subtitle: "Artist · Album",
    artist: "Artist",
    album: "Album",
    thumbnail: null,
    durationSeconds: 180,
    trackNumber: 1,
    format: "lossless",
  });
  const skipped = await waitFor(store, duplicate.job.id, ["completed", "completed_with_warnings", "failed"]);
  assert.equal(skipped.status, "completed");
  assert.equal(skipped.downloadedItems, 0);
  assert.equal(skipped.skippedItems, 1);
  await assert.rejects(() => stat(join(scratchRoot, skipped.id)), { code: "ENOENT" });

  const cancellable = await store.create({
    kind: "song",
    sourceId: "ccccccccccc",
    url: null,
    title: "Cancel Me",
    subtitle: "Artist · Album",
    artist: "Artist",
    album: "Album",
    thumbnail: null,
    durationSeconds: 210,
    trackNumber: 3,
    format: "lossless",
  });
  await waitFor(store, cancellable.job.id, ["running"]);
  await store.cancel(cancellable.job.id);
  const cancelled = await waitFor(store, cancellable.job.id, ["cancelled"]);
  assert.equal(cancelled.downloadedItems, 0);

  cancelMatch = false;
  blockCancelStream = false;
  await store.retry(cancelled.id);
  const retried = await waitFor(store, cancelled.id, ["completed", "completed_with_warnings", "failed"]);
  assert.notEqual(retried.status, "failed", retried.error);
  assert.equal(retried.qobuzItems, 0);
  assert.equal(retried.fallbackItems, 1);
  assert.equal(retried.downloadedItems, 1);
});
