import assert from "node:assert/strict";
import test from "node:test";
import { formatRemaining, formatTime, isActive, isCompleted, isPaused, navidromeLink, totalMinutes, trustedArtwork } from "../lib/music.ts";

test("job state helpers group statuses and build Navidrome links", () => {
  assert.deepEqual(["queued", "running", "retrying", "completed", "failed"].map((status) => isActive({ status })), [true, true, true, false, false]);
  assert.deepEqual(["completed", "completed_with_warnings", "failed", "cancelled"].map((status) => isCompleted({ status })), [true, true, false, false]);
  assert.equal(navidromeLink({ kind: "song", title: "A & B" }, ""), null);
  assert.equal(navidromeLink({ kind: "song", title: "A & B" }, "https://nd.example"), `https://nd.example/app/#/song?filter=${encodeURIComponent('{"title":"A & B"}')}`);
  assert.equal(navidromeLink({ kind: "playlist", title: "Mix" }, "https://nd.example"), `https://nd.example/app/#/album?filter=${encodeURIComponent('{"name":"Mix"}')}`);
});

test("a new track starts paused until its own audio element reports playing", () => {
  assert.equal(isPaused({ key: "", paused: true }, "abc-1"), true);
  assert.equal(isPaused({ key: "abc-1", paused: false }, "abc-1"), false);
  assert.equal(isPaused({ key: "abc-1", paused: false }, "abc-2"), true);
  assert.equal(isPaused({ key: "abc-1", paused: true }, "abc-1"), true);
});

test("collection links only load artwork from YouTube Music image hosts", () => {
  assert.equal(trustedArtwork("https://i.ytimg.com/vi/x/hq.jpg"), "https://i.ytimg.com/vi/x/hq.jpg");
  assert.equal(trustedArtwork("https://lh3.googleusercontent.com/a=w120"), "https://lh3.googleusercontent.com/a=w120");
  for (const value of ["http://i.ytimg.com/a.jpg", "https://evil.example/ytimg.com.jpg", "https://ytimg.com.evil.example/a.jpg", "https://user:pass@i.ytimg.com/a.jpg", "javascript:alert(1)", "not a url", null, `https://i.ytimg.com/${"a".repeat(1000)}`]) {
    assert.equal(trustedArtwork(value), null);
  }
});

test("player and track times format seconds, hours, and missing values", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3725), "1:02:05");
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) assert.equal(formatTime(value), null);
});

test("download time left and collection length use readable units", () => {
  assert.equal(formatRemaining(59), "59s");
  assert.equal(formatRemaining(125), "2m 05s");
  assert.equal(formatRemaining(3700), "1h 1m");
  assert.equal(totalMinutes([{ durationSeconds: 90 }, { durationSeconds: null }, { durationSeconds: 120 }]), 4);
});
