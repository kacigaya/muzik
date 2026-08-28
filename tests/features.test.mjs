import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { formatSelector, sourceUrl, upgradeJobs, YOUTUBE_EXTRACTOR_ARGS } from "../lib/jobs.ts";
import { externalLink, isMusicLink } from "../lib/link.ts";
import { isDue } from "../lib/subscriptions.ts";
import { sourceIdFromName, deletionAllowed } from "../lib/library.ts";
import { validateJobRequest, validateLibraryPath, validateSubscription } from "../lib/validation.ts";

test("keeps m4a untouched and re-encodes every other format", () => {
  assert.equal(formatSelector("m4a"), "bestaudio[ext=m4a]/bestaudio/best");
  assert.equal(formatSelector("opus"), "bestaudio/best");
  assert.equal(formatSelector("flac"), "bestaudio/best");
});

test("uses the embeddable YouTube client before the Android VR fallback", () => {
  assert.equal(YOUTUBE_EXTRACTOR_ARGS, "youtube:player_client=web_embedded,android_vr");
});

test("downloads external links from the link itself", () => {
  assert.equal(sourceUrl({ kind: "song", sourceId: "abcdefghijk", url: null }), "https://music.youtube.com/watch?v=abcdefghijk");
  assert.equal(
    sourceUrl({ kind: "song", sourceId: "0123456789abcdef", url: "https://soundcloud.com/artist/track" }),
    "https://soundcloud.com/artist/track",
  );
});

test("accepts the supported sources and rejects everything else", () => {
  assert.equal(isMusicLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isMusicLink("https://soundcloud.com/artist/track"), true);
  assert.equal(isMusicLink("https://artist.bandcamp.com/album/name"), true);
  assert.equal(isMusicLink("https://example.com/song.mp3"), false);
  assert.equal(externalLink("https://soundcloud.com/artist/track"), "https://soundcloud.com/artist/track");
  assert.equal(externalLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), null, "YouTube keeps its own resolver");
});

test("backfills jobs written by an older release", () => {
  const [job] = upgradeJobs([{ id: "x", kind: "song", sourceId: "abcdefghijk", status: "queued", progress: 0 }]);
  assert.equal(job.url, null);
  assert.equal(job.format, "m4a");
  assert.equal(job.speed, null);
  assert.equal(job.etaSeconds, null);
});

test("drops values a hand-edited jobs.json could smuggle into yt-dlp", () => {
  const [job] = upgradeJobs([{
    id: "x", kind: "song", sourceId: "abcdefghijk", status: "queued", progress: 0,
    url: "http://169.254.169.254/latest/meta-data", format: "../../etc/passwd",
  }]);
  assert.equal(job.url, null, "only supported sources survive");
  assert.equal(job.format, "m4a");
});

test("refuses a job URL outside the supported sources", () => {
  assert.equal(
    validateJobRequest({ kind: "song", sourceId: "9d4ae53afef7313e", url: "https://soundcloud.com/a/b", title: "t", subtitle: "s" }).url,
    "https://soundcloud.com/a/b",
  );
  for (const url of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:3020/api/jobs", "https://evil.example.com/x"]) {
    assert.throws(
      () => validateJobRequest({ kind: "song", sourceId: "9d4ae53afef7313e", url, title: "t", subtitle: "s" }),
      /not a supported music source/,
      url,
    );
  }
});

test("schedules a subscription only once its interval has passed", () => {
  const at = Date.parse("2026-01-02T00:00:00.000Z");
  assert.equal(isDue({ lastCheckedAt: null, intervalHours: 24 }, at), true);
  assert.equal(isDue({ lastCheckedAt: "2026-01-01T00:00:00.000Z", intervalHours: 24 }, at), true);
  assert.equal(isDue({ lastCheckedAt: "2026-01-01T12:00:00.000Z", intervalHours: 24 }, at), false);
});

test("validates what can be followed", () => {
  const subscription = validateSubscription({ kind: "playlist", sourceId: "PLabcdefghij", title: "Mix", subtitle: "Me", intervalHours: 6 });
  assert.equal(subscription.intervalHours, 6);
  assert.equal(subscription.format, "m4a");
  assert.throws(() => validateSubscription({ kind: "song", sourceId: "PLabcdefghij", title: "x", subtitle: "x" }), /albums and playlists/);
  assert.throws(() => validateSubscription({ kind: "playlist", sourceId: "PLabcdefghij", title: "x", subtitle: "x", intervalHours: 0 }), /between 1 and 720/);
});

test("keeps library paths relative and inside the root", () => {
  assert.equal(validateLibraryPath("Artist/Album"), "Artist/Album");
  assert.equal(validateLibraryPath("/Artist/Album"), "Artist/Album");
  assert.equal(validateLibraryPath(null), "");
  assert.throws(() => validateLibraryPath("../../etc"), /invalid/);
  assert.throws(() => validateLibraryPath("Artist/../../etc"), /invalid/);
});

test("recovers the source id from a downloaded file name", () => {
  assert.equal(sourceIdFromName("01 - Title [dQw4w9WgXcQ].m4a"), "dQw4w9WgXcQ");
  assert.equal(sourceIdFromName("01 - Title.m4a"), null);
  assert.equal(sourceIdFromName("01 - Title [short].m4a"), null);
});

test("deleting stays off unless it is switched on", (t) => {
  t.after(() => delete process.env.MUZIK_ALLOW_DELETE);
  delete process.env.MUZIK_ALLOW_DELETE;
  assert.equal(deletionAllowed(), false);
  process.env.MUZIK_ALLOW_DELETE = "1";
  assert.equal(deletionAllowed(), true);
});

test("deleting a track frees it for a later download", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "muzik-library-"));
  const musicRoot = await mkdtemp(join(tmpdir(), "muzik-music-"));
  await mkdir(join(musicRoot, "Artist/Album"), { recursive: true });
  await writeFile(join(musicRoot, "Artist/Album/01 - Song [dQw4w9WgXcQ].m4a"), "audio");
  await writeFile(join(dataDir, "downloaded.txt"), "youtube dQw4w9WgXcQ\nyoutube keptvideoid\n");
  process.env.MUZIK_DATA_DIR = dataDir;
  process.env.MUZIK_MUSIC_DIR = musicRoot;
  process.env.MUZIK_ALLOW_DELETE = "1";
  t.after(() => {
    delete process.env.MUZIK_DATA_DIR;
    delete process.env.MUZIK_MUSIC_DIR;
    delete process.env.MUZIK_ALLOW_DELETE;
  });

  const library = await import("../lib/library.ts?case=delete");
  const root = await library.listLibrary("");
  assert.deepEqual(root.entries.map((entry) => entry.name), ["Artist"], "the root itself lists");
  const listing = await library.listLibrary("Artist/Album");
  assert.equal(listing.entries.length, 1);
  assert.equal(listing.entries[0].sourceId, "dQw4w9WgXcQ");

  const removed = await library.removeFromLibrary("Artist/Album/01 - Song [dQw4w9WgXcQ].m4a");
  assert.deepEqual(removed.sourceIds, ["dQw4w9WgXcQ"]);
  const archive = await readFile(join(dataDir, "downloaded.txt"), "utf8");
  assert.equal(archive.includes("dQw4w9WgXcQ"), false);
  assert.equal(archive.includes("keptvideoid"), true);
});

test("refuses to delete outside the library", async (t) => {
  const musicRoot = await mkdtemp(join(tmpdir(), "muzik-music-"));
  process.env.MUZIK_MUSIC_DIR = musicRoot;
  process.env.MUZIK_ALLOW_DELETE = "1";
  t.after(() => {
    delete process.env.MUZIK_MUSIC_DIR;
    delete process.env.MUZIK_ALLOW_DELETE;
  });
  const library = await import("../lib/library.ts?case=escape");
  await assert.rejects(() => library.removeFromLibrary("../escape"), /outside|invalid/i);
  await assert.rejects(() => library.removeFromLibrary(""), /invalid/i);
});

test("a scratch cleanup that cannot succeed does not take the queue down with it", async (t) => {
  const musicRoot = await mkdtemp(join(tmpdir(), "muzik-worker-music-"));
  const dataDir = await mkdtemp(join(tmpdir(), "muzik-worker-data-"));
  const scratchRoot = await mkdtemp(join(tmpdir(), "muzik-worker-tmp-"));
  const binDir = await mkdtemp(join(tmpdir(), "muzik-worker-bin-"));

  // Reports a finished download, then leaves a scratch directory it has made impossible to
  // remove: the leftover file cannot be unlinked out of a 0500 directory.
  const ytDlp = join(binDir, "yt-dlp");
  await writeFile(ytDlp, [
    "#!/bin/sh",
    'while [ $# -gt 0 ]; do',
    '  case "$1" in',
    '    temp:*)',
    '      scratch="${1#temp:}"',
    '      mkdir -p "$scratch" && : > "$scratch/fragment" && chmod 0500 "$scratch"',
    '      ;;',
    '  esac',
    '  shift',
    'done',
    "exit 0",
    "",
  ].join("\n"));
  await chmod(ytDlp, 0o755);
  // Stands in for the deployments where the sudo fallback cannot work either.
  const sudo = join(binDir, "sudo");
  await writeFile(sudo, "#!/bin/sh\nexit 1\n");
  await chmod(sudo, 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}:${previousPath}`;
  process.env.MUZIK_MUSIC_DIR = musicRoot;
  process.env.MUZIK_DATA_DIR = dataDir;
  process.env.MUZIK_TEMP_DIR = scratchRoot;
  process.env.MUZIK_YTDLP = ytDlp;
  process.env.MUZIK_MIN_FREE_MB = "0";
  for (const name of [
    "MUZIK_LYRICS", "MUZIK_VPN_CONTAINER", "MUZIK_NAVIDROME_CONTAINER",
    "MUZIK_NAVIDROME_API_KEY", "MUZIK_NAVIDROME_USERNAME", "MUZIK_NAVIDROME_PASSWORD", "NAVIDROME_URL",
  ]) delete process.env[name];

  const scratchDirs = [];
  t.after(async () => {
    process.env.PATH = previousPath;
    for (const name of ["MUZIK_MUSIC_DIR", "MUZIK_DATA_DIR", "MUZIK_TEMP_DIR", "MUZIK_YTDLP", "MUZIK_MIN_FREE_MB"]) {
      delete process.env[name];
    }
    for (const scratch of scratchDirs) await chmod(scratch, 0o700).catch(() => {});
  });

  const { JobStore } = await import("../lib/jobs.ts?case=worker");
  const store = new JobStore();
  const download = async (sourceId, title) => {
    const { job } = await store.create({
      kind: "song", sourceId, url: null, title, subtitle: "Test", thumbnail: null, format: "m4a",
    });
    scratchDirs.push(join(scratchRoot, job.id));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = (await store.list()).find((candidate) => candidate.id === job.id);
      if (current && !["queued", "running", "retrying"].includes(current.status)) return current;
      await sleep(50);
    }
    return null;
  };

  const first = await download("aaaaaaaaaaa", "First");
  assert.ok(first, "the job must not be stranded by a cleanup it cannot finish");
  assert.equal(first.status, "completed", "cleanup is cosmetic and must not lose the download");
  await assert.doesNotReject(
    () => stat(join(scratchRoot, first.id)),
    "the scratch directory has to survive, or the cleanup never actually failed",
  );

  // The worker survived, so the store still accepts and drains work.
  const second = await download("bbbbbbbbbbb", "Second");
  assert.ok(second, "the queue must keep draining after a cleanup failure");
  assert.equal(second.status, "completed");
});
