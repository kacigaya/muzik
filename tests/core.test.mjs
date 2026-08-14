import assert from "node:assert/strict";
import test from "node:test";
import { parseProgress } from "../lib/progress.ts";
import { validateJobId, validateJobRequest, validateLinkUrl, validateQuery } from "../lib/validation.ts";
import { canCancel, canRetry, isRetryableYoutubeError, recoverJobs, sourceUrl } from "../lib/jobs.ts";
import { newlyCompleted } from "../lib/completed.ts";
import { genreFromTags, safeMusicPath } from "../lib/metadata.ts";
import { navidromeScanUrl } from "../lib/navidrome.ts";

const BASE_JOB = {
  id: "ed1886fe-0906-4b6c-885f-6e333b1d6af1",
  kind: "song",
  sourceId: "abcdefghijk",
  url: null,
  title: "Song",
  subtitle: "Artist",
  thumbnail: null,
  format: "m4a",
  status: "queued",
  progress: 0,
  speed: null,
  etaSeconds: null,
  itemIndex: null,
  itemCount: null,
  downloadedItems: 0,
  warningCount: 0,
  error: null,
  metadataWarning: null,
  scanWarning: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("validates search and download trust boundaries", () => {
  assert.equal(validateQuery("  oasis  "), "oasis");
  assert.throws(() => validateQuery("x"), /between 2 and 120/);
  assert.throws(() => validateJobId("../../etc/passwd"), /invalid/);
  assert.deepEqual(validateJobRequest({ kind: "song", sourceId: "abcdefghijk", title: "Song", subtitle: "Artist", thumbnail: "https://i.ytimg.com/a.jpg" }), {
    kind: "song", sourceId: "abcdefghijk", url: null, title: "Song", subtitle: "Artist", thumbnail: "https://i.ytimg.com/a.jpg", format: "m4a",
  });
  assert.throws(() => validateJobRequest({ kind: "song", sourceId: "abcdefghijk", title: "x", subtitle: "x", format: "wav" }), /unsupported/);
  assert.throws(() => validateJobRequest({ kind: "playlist", sourceId: "PLgood;touch_bad", title: "x", subtitle: "x" }), /invalid/);
  assert.throws(() => validateJobRequest({ kind: "song", sourceId: "abcdefghijk", title: "x", subtitle: "x", thumbnail: "javascript:alert(1)" }), /invalid/);
  assert.equal(validateLinkUrl("  https://youtu.be/dQw4w9WgXcQ  "), "https://youtu.be/dQw4w9WgXcQ");
  assert.throws(() => validateLinkUrl(null), /required/);
  assert.throws(() => validateLinkUrl(`https://youtu.be/${"x".repeat(1000)}`), /invalid/);
});

test("parses track and collection progress", () => {
  assert.deepEqual(parseProgress("muzik: 50.0%|0|0"), { progress: 50, itemIndex: null, itemCount: null, speed: null, etaSeconds: null });
  assert.deepEqual(parseProgress("muzik: 50.0%|2|4"), { progress: 38, itemIndex: 2, itemCount: 4, speed: null, etaSeconds: null });
  assert.deepEqual(parseProgress("muzik:  0.1%|NA|NA"), { progress: 0, itemIndex: null, itemCount: null, speed: null, etaSeconds: null });
  assert.deepEqual(parseProgress("muzik:100.0%|NA|NA"), { progress: 100, itemIndex: null, itemCount: null, speed: null, etaSeconds: null });
  assert.deepEqual(parseProgress("muzik: 12.0%|0|0|1.20MiB/s|01:05"), {
    progress: 12, itemIndex: null, itemCount: null, speed: "1.20MiB/s", etaSeconds: 65,
  });
  assert.deepEqual(parseProgress("muzik: 12.0%|0|0|Unknown|Unknown"), {
    progress: 12, itemIndex: null, itemCount: null, speed: null, etaSeconds: null,
  });
  assert.equal(parseProgress("[download] 50%"), null);
  assert.equal(parseProgress("muzik: nope|2|4"), null);
});

test("enforces job transitions and restart recovery", () => {
  assert.equal(canCancel({ status: "queued" }), true);
  assert.equal(canCancel({ status: "retrying" }), true);
  assert.equal(canCancel({ status: "completed" }), false);
  assert.equal(canRetry({ status: "failed" }), true);
  assert.equal(canRetry({ status: "running" }), false);
  assert.equal(canRetry({ status: "completed_with_warnings" }), false);
  const running = { ...BASE_JOB, status: "running" };
  const retrying = { ...BASE_JOB, id: "retrying", status: "retrying" };
  recoverJobs([running, retrying], "2026-02-01T00:00:00.000Z");
  assert.equal(running.status, "queued");
  assert.equal(retrying.status, "queued");
  assert.equal(running.updatedAt, "2026-02-01T00:00:00.000Z");
});

test("constructs fixed YouTube Music URLs without shell input", () => {
  assert.equal(sourceUrl(BASE_JOB), "https://music.youtube.com/watch?v=abcdefghijk");
  assert.equal(sourceUrl({ kind: "album", sourceId: "OLAK5uy_example" }), "https://music.youtube.com/playlist?list=OLAK5uy_example");
});

test("recognizes transient YouTube failures that benefit from a fresh request", () => {
  assert.equal(isRetryableYoutubeError(["ERROR: unable to download video data: HTTP Error 403: Forbidden"]), true);
  assert.equal(isRetryableYoutubeError(["ERROR: Sign in to confirm you're not a bot"]), true);
  assert.equal(isRetryableYoutubeError(["ERROR: Video unavailable"]), false);
});

test("builds authenticated Navidrome quick-scan API requests without exposing the password", () => {
  const tokenUrl = navidromeScanUrl("https://music.example/base", "", "gaya", "sesame", "c19b2d");
  assert.equal(tokenUrl.pathname, "/base/rest/startScan.view");
  assert.equal(tokenUrl.searchParams.get("u"), "gaya");
  assert.equal(tokenUrl.searchParams.get("t"), "26719a1196d2a940705a59634eb18eab");
  assert.equal(tokenUrl.searchParams.get("fullScan"), "false");
  assert.equal(tokenUrl.href.includes("sesame"), false);

  const keyUrl = navidromeScanUrl("https://music.example", "secret-key", "", "", "unused");
  assert.equal(keyUrl.searchParams.get("apiKey"), "secret-key");
  assert.equal(keyUrl.searchParams.has("u"), false);
  assert.equal(keyUrl.searchParams.has("t"), false);
});

test("notifies only known jobs that become completed", () => {
  const completed = { ...BASE_JOB, id: "done", status: "completed" };
  const warned = { ...BASE_JOB, id: "warned", status: "completed_with_warnings" };
  assert.deepEqual(newlyCompleted(null, [completed]), []);
  assert.deepEqual(newlyCompleted(new Map([["done", "running"]]), [completed]), [completed]);
  assert.deepEqual(newlyCompleted(new Map([["done", "completed"]]), [completed]), []);
  assert.deepEqual(newlyCompleted(new Map([["warned", "running"]]), [warned]), [warned]);
  assert.deepEqual(newlyCompleted(new Map([["warned", "completed_with_warnings"]]), [warned]), []);
});

test("maps MusicBrainz tags to one broad genre", () => {
  assert.equal(genreFromTags([{ name: "rock", count: 22 }, { name: "nu metal", count: 38 }]), "Metal");
  assert.equal(genreFromTags([{ name: "rap", count: 0 }, { name: "hip hop", count: 3 }]), "Hip-Hop");
  assert.equal(genreFromTags([{ name: "rock", count: -1 }]), "Other");
  assert.equal(genreFromTags([]), "Other");
});

test("accepts only downloaded files inside music library", () => {
  assert.equal(safeMusicPath("/music", "/music/Artist/Album/song.m4a"), "/music/Artist/Album/song.m4a");
  assert.equal(safeMusicPath("/music", "Artist/Album/song.m4a"), "/music/Artist/Album/song.m4a");
  assert.equal(safeMusicPath("/music", "/music/../etc/passwd"), null);
  assert.equal(safeMusicPath("/music", "/music"), null);
});
