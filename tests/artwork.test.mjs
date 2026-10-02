import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAlbumCover, hasArtworkSidebars, squareEmbeddedArtwork } from "../lib/artwork.ts";

test("detects solid sidebars but rejects textured landscape images", () => {
  const pixels = Buffer.alloc(128 * 72 * 3, 80);
  assert.equal(hasArtworkSidebars(pixels), true);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 256;
  assert.equal(hasArtworkSidebars(pixels), false);
  assert.equal(hasArtworkSidebars(Buffer.alloc(0)), false);
});

test("creates square cover without changing audio or replacing existing covers", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "muzik-artwork-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, "song.m4a");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.1", "-f", "lavfi", "-i", "color=red:s=72x72,pad=128:72:28:0:blue", "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-c:v", "mjpeg", "-frames:v", "1", "-disposition:v", "attached_pic", file]);
  const original = await readFile(file);
  assert.equal(await createAlbumCover(file), true);
  const dimensions = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", join(folder, "cover.jpg")])).streams[0];
  assert.deepEqual(dimensions, { width: 72, height: 72 });
  assert.deepEqual(await readFile(file), original);
  await writeFile(join(folder, "cover.jpg"), "custom-cover");
  assert.equal(await createAlbumCover(file), false);
  assert.equal(await readFile(join(folder, "cover.jpg"), "utf8"), "custom-cover");
});

for (const [label, filter] of [["square", "testsrc=size=72x72"], ["landscape", "testsrc=size=128x72"]]) {
  test(`preserves ${label} artwork`, async (t) => {
    const folder = await mkdtemp(join(tmpdir(), "muzik-artwork-skip-"));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const file = join(folder, "song.m4a");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.1", "-f", "lavfi", "-i", filter, "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-c:v", "mjpeg", "-frames:v", "1", "-disposition:v", "attached_pic", file]);
    assert.equal(await createAlbumCover(file), false);
    await assert.rejects(readFile(join(folder, "cover.jpg")), { code: "ENOENT" });
  });
}

test("preserves alternative custom artwork before probing audio", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "muzik-artwork-custom-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(join(folder, "Folder.png"), "custom");
  assert.equal(await createAlbumCover(join(folder, "missing.m4a")), false);
});

for (const extension of ["m4a", "flac"]) {
  test(`squares embedded ${extension} artwork and keeps audio and tags`, async (t) => {
    const folder = await mkdtemp(join(tmpdir(), "muzik-artwork-embedded-"));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const file = join(folder, `song.${extension}`);
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.1", "-f", "lavfi", "-i", "color=red:s=72x72,pad=128:72:28:0:blue", "-map", "0:a", "-map", "1:v", ...(extension === "m4a" ? ["-c:a", "aac"] : []), "-c:v", "mjpeg", "-frames:v", "1", "-disposition:v", "attached_pic", "-metadata", "title=Song", file]);
    const audio = () => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a", "-f", "md5", "-"], { encoding: "utf8" });
    const before = audio();
    assert.equal(await squareEmbeddedArtwork(file), true);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height:stream_disposition=attached_pic:format_tags=title", "-of", "json", file]));
    const picture = probe.streams.find((stream) => stream.disposition?.attached_pic === 1);
    assert.deepEqual([picture.width, picture.height], [72, 72]);
    assert.equal(probe.format.tags.title ?? probe.format.tags.TITLE, "Song");
    assert.equal(audio(), before);
    assert.equal(await squareEmbeddedArtwork(file), false);
    assert.deepEqual((await readdir(folder)).sort(), [`song.${extension}`]);
  });
}
