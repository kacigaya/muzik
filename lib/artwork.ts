import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// YouTube Music wraps square covers in solid-color 16:9 sidebars.
// Check both bars before cropping so ordinary landscape artwork is preserved.
export function hasArtworkSidebars(pixels: Uint8Array) {
  if (pixels.length !== 128 * 72 * 3) return false;
  for (const start of [0, 103]) {
    const means = [0, 0, 0];
    for (let y = 0; y < 72; y++) {
      for (let x = start; x < start + 25; x++) {
        for (let c = 0; c < 3; c++) means[c] += pixels[(y * 128 + x) * 3 + c] / (72 * 25);
      }
    }
    let variance = 0;
    for (let y = 0; y < 72; y++) {
      for (let x = start; x < start + 25; x++) {
        for (let c = 0; c < 3; c++) variance += (pixels[(y * 128 + x) * 3 + c] - means[c]) ** 2;
      }
    }
    if (variance / (72 * 25 * 3) > 36) return false;
  }
  return true;
}

export async function createAlbumCover(file: string): Promise<boolean> {
  const target = join(dirname(file), "cover.jpg");
  const entries = await readdir(dirname(file));
  if (entries.some((name) => /^(cover|folder|front)\./i.test(name))) return false;
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=index,width,height:stream_disposition=attached_pic", "-of", "json", file], { timeout: 60_000 });
  const probe = JSON.parse(stdout) as { streams?: { index: number; width: number; height: number; disposition?: { attached_pic?: number } }[] };
  const cover = probe.streams?.find((stream) => stream.disposition?.attached_pic === 1);
  if (!cover || Math.abs(cover.width / cover.height - 16 / 9) > 0.01) return false;
  const input = ["-v", "error", "-i", file, "-map", `0:${cover.index}`, "-frames:v", "1"];
  const { stdout: pixels } = await exec("ffmpeg", [...input, "-vf", "scale=128:72", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", timeout: 60_000 });
  if (!hasArtworkSidebars(pixels)) return false;
  const temporary = join(dirname(file), `.muzik-cover-${randomUUID()}.jpg`);
  try {
    await exec("ffmpeg", [...input, "-vf", "crop=ih:ih", "-q:v", "2", temporary], { timeout: 60_000 });
    // Exclusive copy also protects a custom cover created while ffmpeg runs.
    await copyFile(temporary, target, constants.COPYFILE_EXCL);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw cause;
  } finally {
    await rm(temporary, { force: true });
  }
}
