import assert from "node:assert/strict";
import test from "node:test";
import { isMusicLink, parseMusicLink } from "../lib/link.ts";

const SONG = { videoId: "dQw4w9WgXcQ", listId: null, listKind: null };

test("parses watch links on every supported host", () => {
  for (const host of ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]) {
    assert.deepEqual(parseMusicLink(`https://${host}/watch?v=dQw4w9WgXcQ`), SONG);
  }
  assert.deepEqual(parseMusicLink("https://youtu.be/dQw4w9WgXcQ?si=abc123&t=42"), SONG);
  assert.deepEqual(parseMusicLink("music.youtube.com/watch?v=dQw4w9WgXcQ"), SONG);
  assert.deepEqual(parseMusicLink("https://www.youtube.com/shorts/dQw4w9WgXcQ"), SONG);
  assert.deepEqual(parseMusicLink("https://www.youtube.com/embed/dQw4w9WgXcQ"), SONG);
});

test("parses playlist and album links", () => {
  assert.deepEqual(parseMusicLink("https://music.youtube.com/playlist?list=VLPLabcdefgh12345"), {
    videoId: null, listId: "PLabcdefgh12345", listKind: "playlist",
  });
  assert.deepEqual(parseMusicLink("https://music.youtube.com/playlist?list=OLAK5uy_example123"), {
    videoId: null, listId: "OLAK5uy_example123", listKind: "album",
  });
});

test("keeps both ids for watch links that include a list", () => {
  assert.deepEqual(parseMusicLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=OLAK5uy_example123"), {
    videoId: "dQw4w9WgXcQ", listId: "OLAK5uy_example123", listKind: "album",
  });
});

test("drops radio mixes and private lists but keeps the song", () => {
  assert.deepEqual(parseMusicLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ"), SONG);
  assert.equal(parseMusicLink("https://www.youtube.com/playlist?list=RDAMVMdQw4w9WgXcQ"), null);
  assert.equal(parseMusicLink("https://www.youtube.com/playlist?list=WL"), null);
  assert.equal(parseMusicLink("https://www.youtube.com/playlist?list=LM"), null);
});

test("rejects unusable input", () => {
  assert.equal(parseMusicLink("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseMusicLink("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseMusicLink("https://www.youtube.com/watch?v=tooshort"), null);
  assert.equal(parseMusicLink("https://www.youtube.com/"), null);
  assert.equal(parseMusicLink("daft punk"), null);
  assert.equal(parseMusicLink(""), null);
});

test("detects link-shaped input for the UI branch", () => {
  assert.equal(isMusicLink("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isMusicLink("music.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isMusicLink("daft punk"), false);
  assert.equal(isMusicLink("https://example.com/watch?v=dQw4w9WgXcQ"), false);
});
