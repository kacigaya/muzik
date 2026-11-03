import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listeningTrack, listeningCommand, updateListeningLibrary, updateQueue, restoreQueue } from "../lib/listening.ts";
import { changeListeningLibrary, readListeningLibrary } from "../lib/listening-store.ts";

const song = (id = "abcdefghijk") => ({ kind: "song", sourceId: id, title: "Song", subtitle: "Artist", artist: "Artist", album: null, thumbnail: null, durationSeconds: 180, trackNumber: null, itemCount: null });
const empty = () => ({ likes: [], playlists: [] });
const id = "01234567-0123-0123-0123-0123456789ab";

test("saved tracks reject external sources, unsafe URLs, bad metadata, and forged commands", () => {
  assert.deepEqual(listeningTrack(song()), song());
  for (const value of [{ ...song(), kind: "album" }, { ...song(), sourceId: "../x" }, { ...song(), url: "http://localhost" }, { ...song(), title: "" }, { ...song(), thumbnail: "javascript:alert(1)" }, { ...song(), durationSeconds: -1 }]) {
    assert.throws(() => listeningTrack(value));
  }
  assert.throws(() => listeningCommand({ action: "create", name: " " }));
  assert.throws(() => listeningCommand({ action: "delete", id: "../../etc" }));
  assert.throws(() => listeningCommand({ action: "add", id, tracks: [] }));
  assert.throws(() => listeningCommand({ action: "add", id, tracks: Array(501).fill(song()) }));
});

test("likes are idempotent; playlist operations keep unrelated tracks and enforce capacity", () => {
  const original = empty();
  const liked = updateListeningLibrary(original, { action: "like", track: song() }, id);
  assert.equal(original.likes.length, 0);
  assert.deepEqual(updateListeningLibrary(liked, { action: "like", track: song() }, id), liked);
  assert.equal(updateListeningLibrary(liked, { action: "unlike", sourceId: song().sourceId }, id).likes.length, 0);
  let library = updateListeningLibrary(liked, { action: "create", name: "Mix" }, id);
  library = updateListeningLibrary(library, { action: "add", id, tracks: [song(), song(), song("12345678901")] }, id);
  assert.equal(library.playlists[0].tracks.length, 2);
  library = updateListeningLibrary(library, { action: "rename", id, name: "Road" }, id);
  assert.equal(library.playlists[0].name, "Road");
  library = updateListeningLibrary(library, { action: "remove", id, sourceId: song().sourceId }, id);
  assert.equal(library.playlists[0].tracks[0].sourceId, "12345678901");
  library = updateListeningLibrary(library, { action: "delete", id }, id);
  assert.equal(library.playlists.length, 0);
  assert.equal(library.likes.length, 1);
  assert.throws(() => updateListeningLibrary(library, { action: "add", id, tracks: [song()] }, id), /not found/);
  assert.throws(() => updateListeningLibrary({ likes: [], playlists: Array(100).fill({ id, name: "x", tracks: [] }) }, { action: "create", name: "x" }, id), /limit/);
});

test("queue moves and removals preserve the active song and clamp the final index", () => {
  const tracks = [song(), song("12345678901"), song("ABCDEFGHIJK")];
  const queue = { tracks, index: 1 };
  const moved = updateQueue(queue, { type: "move", index: 1, direction: -1 });
  assert.equal(moved.index, 0);
  assert.equal(moved.tracks[0].sourceId, tracks[1].sourceId);
  assert.equal(updateQueue(queue, { type: "remove", index: 0 }).index, 0);
  const last = updateQueue({ tracks, index: 2 }, { type: "remove", index: 2 });
  assert.equal(last.index, 1);
  assert.deepEqual(updateQueue({ tracks: [song()], index: 0 }, { type: "remove", index: 0 }), { tracks: [], index: 0 });
  assert.equal(updateQueue(queue, { type: "select", index: -1 }), queue);
  assert.equal(updateQueue(queue, { type: "enqueue", tracks: Array(600).fill(song()) }).tracks.length, 500);
  assert.deepEqual(restoreQueue({ tracks, index: 9 }), { tracks, index: 2 });
  assert.throws(() => restoreQueue({ tracks: [{ ...song(), sourceId: "bad" }], index: 0 }));
});

test("saved music survives reload and concurrent writes; corrupt data is never replaced", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "muzik-listening-"));
  const original = process.env.MUZIK_DATA_DIR;
  process.env.MUZIK_DATA_DIR = directory;
  t.after(() => { if (original === undefined) delete process.env.MUZIK_DATA_DIR; else process.env.MUZIK_DATA_DIR = original; });
  assert.deepEqual(await readListeningLibrary(), empty());
  await Promise.all([changeListeningLibrary({ action: "like", track: song() }), changeListeningLibrary({ action: "create", name: "Mix" }), changeListeningLibrary({ action: "like", track: song("12345678901") })]);
  const library = await readListeningLibrary();
  assert.equal(library.likes.length, 2);
  assert.equal(library.playlists.length, 1);
  const file = join(directory, "listening.json");
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await writeFile(file, "{broken");
  await assert.rejects(changeListeningLibrary({ action: "like", track: song() }), /invalid/);
  assert.equal(await readFile(file, "utf8"), "{broken");
});
