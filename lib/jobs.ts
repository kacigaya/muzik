import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { downloadQobuzArtwork, downloadQobuzFlac, losslessRelativePath, qobuzEnabled, resolveQobuz, type QobuzStream } from "./lossless.ts";
import { parseProgress } from "./progress.ts";
import { organizeFiles, safeMusicPath } from "./metadata.ts";
import { musicDir } from "./settings.ts";
import { fetchLyrics } from "./lyrics.ts";
import { startNavidromeScan } from "./navidrome.ts";
import { externalUrl } from "./sources.ts";
import { resolveSourceItem } from "./resolve.ts";
import { listTracks } from "./tracks.ts";
import { defaultFormat } from "./validation.ts";
import { AUDIO_FORMATS, type AudioFormat, type CreateJobRequest, type DownloadJob, type SearchItem } from "./types.ts";

const exec = promisify(execFile);
const TERMINAL_LIMIT = 100;
const TRANSIENT_RETRY_COOLDOWN_MS = 5_000;
export const YOUTUBE_EXTRACTOR_ARGS = "youtube:player_client=web_embedded,android_vr";
const DEFAULT_OUTPUT_TEMPLATE =
  "%(artist,uploader|Unknown Artist)s/%(album,playlist|Singles)s/%(track_number,playlist_index|00)02d - %(track,title)s [%(id)s].%(ext)s";

function now() {
  return new Date().toISOString();
}

export function sourceUrl(job: Pick<DownloadJob, "kind" | "sourceId"> & { url?: string | null }) {
  if (job.url) return job.url;
  return job.kind === "song"
    ? `https://music.youtube.com/watch?v=${job.sourceId}`
    : `https://music.youtube.com/playlist?list=${job.sourceId}`;
}

/** Lossless fallback keeps YouTube's native AAC/Opus codec instead of transcoding to FLAC. */
export function formatSelector(format: AudioFormat) {
  if (format === "lossless") return "bestaudio[acodec^=mp4a]/bestaudio[acodec^=opus]/bestaudio/best";
  return format === "m4a" ? "bestaudio[ext=m4a]/bestaudio/best" : "bestaudio/best";
}

/**
 * Fields added after the first release are backfilled so an old jobs.json still loads.
 * Values are re-checked rather than trusted: they end up as yt-dlp arguments, and the
 * file can be edited by hand.
 */
export function upgradeJobs(jobs: DownloadJob[]) {
  for (const job of jobs) {
    job.url = job.url ? externalUrl(job.url) : null;
    job.format = AUDIO_FORMATS.includes(job.format) ? job.format : defaultFormat();
    job.artist ??= null;
    job.album ??= null;
    job.durationSeconds ??= null;
    job.trackNumber ??= null;
    job.speed ??= null;
    job.etaSeconds ??= null;
    job.downloadedItems ??= 0;
    job.qobuzItems ??= 0;
    job.fallbackItems ??= 0;
    job.skippedItems ??= 0;
    job.warningCount ??= 0;
    job.error ??= null;
    job.metadataWarning ??= null;
    job.scanWarning ??= null;
  }
  return jobs;
}

export function canCancel(job: Pick<DownloadJob, "status">) {
  return job.status === "queued" || job.status === "running" || job.status === "retrying";
}

export function canRetry(job: Pick<DownloadJob, "status">) {
  return job.status === "failed" || job.status === "cancelled";
}

export function recoverJobs(jobs: DownloadJob[], timestamp = now()) {
  for (const job of jobs) {
    if (job.status === "running" || job.status === "retrying") {
      job.status = "queued";
      job.updatedAt = timestamp;
    }
  }
  return jobs;
}

function safeError(lines: string[]) {
  return lines
    .filter((line) => line.startsWith("ERROR:"))
    .at(-1)
    ?.replace(/^ERROR:\s*/, "")
    .slice(0, 500) ?? "Download failed. Check service logs for details.";
}

export function isRetryableYoutubeError(lines: string[]) {
  const message = lines.join("\n").toLowerCase();
  return message.includes("http error 403")
    || message.includes("403: forbidden")
    || message.includes("sign in to confirm you’re not a bot")
    || message.includes("sign in to confirm you're not a bot");
}

export class JobStore {
  private jobs: DownloadJob[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;
  private activeProcess: ReturnType<typeof spawn> | null = null;
  private activeAbortController: AbortController | null = null;
  private activeJobId: string | null = null;
  private workerRunning = false;
  private scanChain = Promise.resolve();
  private persistChain = Promise.resolve();
  private lastPersistedProgress = -1;
  private readonly dataDir = process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data";
  private readonly tempDir = process.env.MUZIK_TEMP_DIR ?? "/srv/muzik/tmp";
  private readonly ytDlp = process.env.MUZIK_YTDLP ?? `${process.cwd()}/.venv/bin/yt-dlp`;
  private readonly containerCli = process.env.MUZIK_CONTAINER_CLI ?? "podman";
  // Both are opt-in: without a VPN container yt-dlp uses the host network, and without a
  // Navidrome container the library picks new files up on its own next scan.
  private readonly vpnContainer = process.env.MUZIK_VPN_CONTAINER ?? "";
  private readonly navidromeContainer = process.env.MUZIK_NAVIDROME_CONTAINER ?? "";

  private async load() {
    if (this.loaded) return;
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(this.tempDir, { recursive: true });
    try {
      this.jobs = JSON.parse(await readFile(join(this.dataDir, "jobs.json"), "utf8")) as DownloadJob[];
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
    upgradeJobs(recoverJobs(this.jobs));
    this.loaded = true;
    await this.persist();
  }

  private async persist() {
    const terminal = this.jobs.filter((job) => !["queued", "running", "retrying"].includes(job.status));
    const keepTerminal = new Set(terminal.slice(0, TERMINAL_LIMIT).map((job) => job.id));
    this.jobs = this.jobs.filter((job) => ["queued", "running", "retrying"].includes(job.status) || keepTerminal.has(job.id));
    const payload = JSON.stringify(this.jobs, null, 2);
    const target = join(this.dataDir, "jobs.json");
    const temporary = `${target}.tmp`;
    this.persistChain = this.persistChain.then(async () => {
      await writeFile(temporary, payload, { mode: 0o600 });
      await rename(temporary, target);
    });
    await this.persistChain;
    for (const listener of this.listeners) listener();
  }

  /** Called on every persisted change so the stream endpoint can push instead of poll. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list() {
    await this.load();
    void this.runWorker();
    return [...this.jobs];
  }

  async create(request: CreateJobRequest) {
    if (!(await musicDir())) throw new Error("Choose a music folder before downloading.");
    await this.load();
    const duplicate = this.jobs.find(
      (job) => job.kind === request.kind && job.sourceId === request.sourceId && ["queued", "running", "retrying"].includes(job.status),
    );
    if (duplicate) return { job: duplicate, created: false };
    const timestamp = now();
    const job: DownloadJob = {
      ...request,
      id: randomUUID(),
      status: "queued",
      progress: 0,
      speed: null,
      etaSeconds: null,
      itemIndex: null,
      itemCount: null,
      downloadedItems: 0,
      qobuzItems: 0,
      fallbackItems: 0,
      skippedItems: 0,
      warningCount: 0,
      error: null,
      metadataWarning: null,
      scanWarning: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.jobs.unshift(job);
    await this.persist();
    void this.runWorker();
    return { job, created: true };
  }

  async cancel(id: string) {
    await this.load();
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error("Job not found.");
    if (!canCancel(job)) {
      throw new Error("Job cannot be cancelled.");
    }
    job.status = "cancelled";
    job.updatedAt = now();
    if (this.activeJobId === id && this.activeProcess?.pid) {
      try {
        process.kill(-this.activeProcess.pid, "SIGTERM");
        const pid = this.activeProcess.pid;
        setTimeout(() => {
          try { process.kill(-pid, "SIGKILL"); } catch { /* already stopped */ }
        }, 5_000).unref();
      } catch { /* process already stopped */ }
    }
    if (this.activeJobId === id) this.activeAbortController?.abort(new Error("Download cancelled."));
    await this.persist();
    return job;
  }

  async retry(id: string) {
    await this.load();
    const job = this.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error("Job not found.");
    if (!canRetry(job)) {
      throw new Error("Job cannot be retried.");
    }
    Object.assign(job, {
      status: "queued",
      progress: 0,
      speed: null,
      etaSeconds: null,
      itemIndex: null,
      itemCount: null,
      downloadedItems: 0,
      qobuzItems: 0,
      fallbackItems: 0,
      skippedItems: 0,
      warningCount: 0,
      error: null,
      metadataWarning: null,
      scanWarning: null,
      updatedAt: now(),
    });
    await this.persist();
    void this.runWorker();
    return job;
  }

  async clearFinished() {
    await this.load();
    this.jobs = this.jobs.filter((job) => canCancel(job));
    await this.persist();
    return [...this.jobs];
  }

  private async runWorker() {
    await this.load();
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      let job = this.jobs.find((candidate) => candidate.status === "queued");
      while (job) {
        try {
          await this.download(job);
        } catch {
          // A job left queued would be picked again on the very next iteration, so the
          // status has to move even when the throw came before download() marked it running.
          if (canCancel(job)) {
            job.status = "failed";
            job.error = "Download stopped unexpectedly. Check service logs for details.";
            job.updatedAt = now();
            try { await this.persist(); } catch { /* the in-memory status already frees the queue */ }
          }
        }
        job = this.jobs.find((candidate) => candidate.status === "queued");
      }
    } finally {
      this.workerRunning = false;
    }
  }

  /**
   * yt-dlp fails deep into a playlist when the disk fills, so refuse before starting.
   * The scratch directory is checked as well: it often sits on a different filesystem
   * from the library, and every download passes through it first.
   */
  private async freeSpaceShortage(musicRoot: string) {
    const minimumMb = Number(process.env.MUZIK_MIN_FREE_MB ?? 500);
    if (!Number.isFinite(minimumMb) || minimumMb <= 0) return null;
    for (const [label, path] of [["music folder", musicRoot], ["scratch folder", this.tempDir]] as const) {
      try {
        const stats = await statfs(path);
        const freeMb = Math.floor((stats.bsize * stats.bavail) / 1024 / 1024);
        if (freeMb < minimumMb) return `Only ${freeMb} MB free in the ${label}, and ${minimumMb} MB are required.`;
      } catch { /* an unreadable mount is not evidence of a full disk */ }
    }
    return null;
  }

  private args(job: DownloadJob, musicRoot: string) {
    const jobTemp = join(this.tempDir, job.id);
    return [
      "--newline",
      "--no-colors",
      "--progress",
      "--ignore-errors",
      "--js-runtimes", `node:${process.execPath}`,
      "--extractor-args", YOUTUBE_EXTRACTOR_ARGS,
      "--download-archive", join(this.dataDir, "downloaded.txt"),
      "--paths", `home:${musicRoot}`,
      "--paths", `temp:${jobTemp}`,
      "--output", process.env.MUZIK_OUTPUT_TEMPLATE ?? DEFAULT_OUTPUT_TEMPLATE,
      "--format", formatSelector(job.format),
      "--extract-audio",
      "--audio-format", job.format === "lossless" ? "best" : job.format,
      "--audio-quality", "0",
      "--embed-metadata",
      "--embed-thumbnail",
      "--convert-thumbnails", "jpg",
      "--progress-template", "download:muzik:%(progress._percent_str)s|%(playlist_index|0)s|%(playlist_count|0)s|%(progress._speed_str)s|%(progress._eta_str)s",
      "--print", "after_move:muzik-file:%(filepath)s",
      sourceUrl(job),
    ];
  }

  private async downloaderProcess(job: DownloadJob, musicRoot: string) {
    const options: Parameters<typeof spawn>[2] = { detached: true, stdio: ["ignore", "pipe", "pipe"] };
    if (!this.vpnContainer) {
      return spawn(this.ytDlp, this.args(job, musicRoot), options);
    }
    const { stdout } = await exec("sudo", ["-n", this.containerCli, "inspect", "--format", "{{.State.Pid}}", this.vpnContainer], { timeout: 5_000 });
    const networkPid = stdout.trim();
    if (!/^\d+$/.test(networkPid) || networkPid === "0") throw new Error("Download VPN is unavailable.");
    return spawn("sudo", ["-n", "nsenter", "--target", networkPid, "--net", "--", this.ytDlp, ...this.args(job, musicRoot)], options);
  }

  private async isArchived(sourceId: string) {
    try {
      const lines = (await readFile(join(this.dataDir, "downloaded.txt"), "utf8")).split(/\r?\n/);
      return lines.includes(`youtube ${sourceId}`);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw cause;
    }
  }

  private async markArchived(sourceId: string) {
    if (await this.isArchived(sourceId)) return;
    await appendFile(join(this.dataDir, "downloaded.txt"), `youtube ${sourceId}\n`, { mode: 0o600 });
  }

  private isCancelled(job: DownloadJob, signal?: AbortSignal) {
    return signal?.aborted || this.jobs.find((candidate) => candidate.id === job.id)?.status === "cancelled";
  }

  private aggregateProgress(job: DownloadJob, itemIndex: number, itemCount: number, itemProgress: number) {
    job.itemIndex = itemCount > 1 ? itemIndex : null;
    job.itemCount = itemCount > 1 ? itemCount : null;
    job.progress = itemCount > 1
      ? Math.min(100, Math.round(((itemIndex - 1) + itemProgress / 100) / itemCount * 100))
      : itemProgress;
    job.updatedAt = now();
    if (job.progress !== this.lastPersistedProgress) {
      this.lastPersistedProgress = job.progress;
      void this.persist();
    }
  }

  private async youtubeFallback(job: DownloadJob, track: SearchItem, musicRoot: string, itemIndex: number, itemCount: number) {
    const commandJob: DownloadJob = {
      ...job,
      kind: "song",
      sourceId: track.sourceId,
      url: null,
      title: track.title,
      subtitle: track.subtitle,
      artist: track.artist,
      album: track.album,
      thumbnail: track.thumbnail,
      durationSeconds: track.durationSeconds,
      trackNumber: track.trackNumber,
      format: "lossless",
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = await this.downloaderProcess(commandJob, musicRoot);
    } catch (cause) {
      return {
        exitCode: 127,
        errors: [`ERROR: ${cause instanceof Error ? cause.message : "Download VPN is unavailable."}`],
        files: [] as string[],
        downloaded: 0,
      };
    }
    this.activeProcess = child;
    const files = new Set<string>();
    const errors: string[] = [];
    let stdout = "";
    let stderr = "";
    let downloaded = 0;
    const outputLine = (line: string) => {
      if (line.startsWith("muzik-file:")) {
        const file = safeMusicPath(musicRoot, line.slice("muzik-file:".length).trim());
        if (file && !files.has(file)) {
          files.add(file);
          downloaded += 1;
          job.downloadedItems += 1;
          job.fallbackItems += 1;
        }
      }
      const progress = parseProgress(line);
      if (!progress) return;
      job.speed = progress.speed;
      job.etaSeconds = progress.etaSeconds;
      this.aggregateProgress(job, itemIndex, itemCount, progress.progress);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) outputLine(line);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const lines = stderr.split("\n");
      stderr = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("ERROR:")) errors.push(line);
    });
    const exitCode = await new Promise<number>((resolve) => {
      child.once("error", () => resolve(127));
      child.once("close", (code) => resolve(code ?? 1));
    });
    if (stdout.trim()) outputLine(stdout.trim());
    if (stderr.startsWith("ERROR:")) errors.push(stderr.trim());
    this.activeProcess = null;
    if (!downloaded && !errors.length && exitCode === 0) job.skippedItems += 1;
    return { exitCode, errors, files: [...files], downloaded };
  }

  private async tagQobuzFlac(stream: QobuzStream, rawFile: string, taggedFile: string, artworkFile: string | null, signal: AbortSignal) {
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", rawFile];
    if (artworkFile) args.push("-i", artworkFile);
    args.push("-map", "0:a");
    if (artworkFile) args.push("-map", "1:v", "-c:v", "mjpeg", "-disposition:v", "attached_pic");
    args.push("-c:a", "copy", "-map_metadata", "-1");
    const metadata: Record<string, string> = {
      title: stream.title,
      artist: stream.artist,
      album_artist: stream.albumArtist,
      album: stream.album,
      ...(stream.trackNumber && { track: String(stream.trackNumber) }),
      ...(stream.discNumber && { disc: String(stream.discNumber) }),
      ...(stream.releaseDate && { date: stream.releaseDate }),
      ...(stream.copyright && { copyright: stream.copyright }),
      comment: `Qobuz track ${stream.trackId}`,
    };
    for (const [key, value] of Object.entries(metadata)) args.push("-metadata", `${key}=${value}`);
    args.push(taggedFile);
    await exec("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60_000, signal });
  }

  private async verifyNativeFlac(file: string, expected: QobuzStream, signal: AbortSignal) {
    const { stdout } = await exec("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,bits_per_sample,bits_per_raw_sample",
      "-of", "json",
      file,
    ], { timeout: 60_000, signal });
    const stream = (JSON.parse(stdout) as { streams?: Array<Record<string, string | number>> }).streams?.[0];
    const sampleRate = Number(stream?.sample_rate);
    const bitDepth = Number(stream?.bits_per_raw_sample || stream?.bits_per_sample);
    const expectedSampleRate = expected.samplingRate < 1_000 ? expected.samplingRate * 1_000 : expected.samplingRate;
    if (
      stream?.codec_name !== "flac"
      || sampleRate !== expectedSampleRate
      || bitDepth !== expected.bitDepth
    ) {
      throw new Error("Qobuz file did not probe as native FLAC.");
    }
  }

  private async placeQobuzFile(job: DownloadJob, stream: QobuzStream, taggedFile: string, musicRoot: string) {
    const target = safeMusicPath(musicRoot, join(musicRoot, losslessRelativePath(stream, job.sourceId)));
    if (!target) throw new Error("Qobuz metadata produced an unsafe library path.");
    try {
      await stat(target);
      return null;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.muzik-${job.id}.part`;
    await rm(temporary, { force: true });
    try {
      await copyFile(taggedFile, temporary, FS_CONSTANTS.COPYFILE_EXCL);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    return target;
  }

  private async qobuzTrack(job: DownloadJob, track: SearchItem, musicRoot: string, itemIndex: number, itemCount: number, signal: AbortSignal) {
    if (!track.artist || !qobuzEnabled()) return null;
    const stream = await resolveQobuz({
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationSeconds: track.durationSeconds,
      trackNumber: track.trackNumber,
    }, { signal });
    if (!stream) return null;
    const scratch = join(this.tempDir, job.id);
    const rawFile = join(scratch, `${track.sourceId}.qobuz.flac`);
    const taggedFile = join(scratch, `${track.sourceId}.tagged.flac`);
    const artworkFile = stream.artworkUrl ? join(scratch, `${track.sourceId}.cover`) : null;
    await downloadQobuzFlac(stream.url, rawFile, {
      signal,
      onProgress: (received, total) => {
        const percent = total ? Math.min(99, Math.round(received / total * 100)) : 0;
        this.aggregateProgress(job, itemIndex, itemCount, percent);
      },
    });
    let embeddedArtwork: string | null = null;
    if (stream.artworkUrl && artworkFile) {
      try {
        await downloadQobuzArtwork(stream.artworkUrl, artworkFile, { signal });
        embeddedArtwork = artworkFile;
      } catch {
        job.warningCount += 1;
      }
    }
    try {
      await this.tagQobuzFlac(stream, rawFile, taggedFile, embeddedArtwork, signal);
    } catch (cause) {
      if (!embeddedArtwork) throw cause;
      job.warningCount += 1;
      await rm(taggedFile, { force: true });
      await this.tagQobuzFlac(stream, rawFile, taggedFile, null, signal);
    }
    await this.verifyNativeFlac(taggedFile, stream, signal);
    const file = await this.placeQobuzFile({ ...job, sourceId: track.sourceId }, stream, taggedFile, musicRoot);
    if (!file) {
      job.skippedItems += 1;
      try {
        await this.markArchived(track.sourceId);
      } catch {
        job.warningCount += 1;
      }
      return { file: null, stream };
    }
    job.downloadedItems += 1;
    job.qobuzItems += 1;
    try {
      await this.markArchived(track.sourceId);
    } catch {
      job.warningCount += 1;
    }
    this.aggregateProgress(job, itemIndex, itemCount, 100);
    return { file, stream };
  }

  private async losslessTracks(job: DownloadJob, signal: AbortSignal) {
    if (job.kind === "album") return listTracks("album", job.sourceId, { signal });
    let track: SearchItem = {
      kind: "song",
      sourceId: job.sourceId,
      title: job.title,
      subtitle: job.subtitle,
      artist: job.artist,
      album: job.album,
      thumbnail: job.thumbnail,
      durationSeconds: job.durationSeconds,
      trackNumber: job.trackNumber,
      itemCount: null,
    };
    if (!track.artist || !track.durationSeconds) {
      try {
        const resolved = await resolveSourceItem("song", job.sourceId, { signal });
        track = { ...resolved, album: resolved.album ?? track.album, trackNumber: resolved.trackNumber ?? track.trackNumber };
        Object.assign(job, {
          title: track.title,
          subtitle: track.subtitle,
          artist: track.artist,
          album: track.album,
          thumbnail: track.thumbnail ?? job.thumbnail,
          durationSeconds: track.durationSeconds,
          trackNumber: track.trackNumber,
          updatedAt: now(),
        });
        await this.persist();
      } catch { /* incomplete legacy metadata falls back to YouTube below */ }
    }
    return [track];
  }

  private async downloadLossless(job: DownloadJob, musicRoot: string, signal: AbortSignal) {
    const tracks = await this.losslessTracks(job, signal);
    const files = new Set<string>();
    const youtubeErrors: string[] = [];
    job.itemCount = tracks.length > 1 ? tracks.length : null;
    for (const [offset, track] of tracks.entries()) {
      if (this.isCancelled(job, signal)) return;
      const index = offset + 1;
      job.itemIndex = tracks.length > 1 ? index : null;
      if (await this.isArchived(track.sourceId)) {
        job.skippedItems += 1;
        this.aggregateProgress(job, index, tracks.length, 100);
        await this.persist();
        continue;
      }

      let qobuz: { file: string | null; stream: QobuzStream } | null = null;
      try {
        qobuz = await this.qobuzTrack(job, track, musicRoot, index, tracks.length, signal);
      } catch {
        if (signal.aborted) return;
        job.warningCount += 1;
      }
      if (qobuz) {
        if (qobuz.file) files.add(qobuz.file);
        await this.persist();
        continue;
      }

      const fallback = await this.youtubeFallback(job, track, musicRoot, index, tracks.length);
      for (const file of fallback.files) files.add(file);
      youtubeErrors.push(...fallback.errors);
      if ((fallback.exitCode !== 0 || fallback.errors.length) && fallback.downloaded === 0) job.warningCount += 1;
      this.aggregateProgress(job, index, tracks.length, 100);
      await this.persist();
    }

    if (this.isCancelled(job, signal)) return;
    job.progress = 100;
    job.speed = null;
    job.etaSeconds = null;
    job.updatedAt = now();
    if (!job.downloadedItems && !job.skippedItems) {
      if (job.kind === "song" && isRetryableYoutubeError(youtubeErrors)) {
        this.scheduleTransientRetry(job);
        await this.persist();
        return;
      }
      job.status = "failed";
      job.error = safeError(youtubeErrors);
      await this.persist();
      return;
    }
    if (!job.downloadedItems) {
      job.status = job.warningCount ? "completed_with_warnings" : "completed";
      await this.persist();
      return;
    }

    const organized = await organizeFiles([...files], musicRoot, this.dataDir);
    if (this.isCancelled(job, signal)) return;
    await fetchLyrics([...files]);
    if (this.isCancelled(job, signal)) return;
    if (organized.warnings.length) {
      job.metadataWarning = `Downloaded, but metadata organization had ${organized.warnings.length} warning(s).`;
      job.warningCount += organized.warnings.length;
    }
    job.status = job.warningCount ? "completed_with_warnings" : "completed";
    await this.persist();
    if (job.downloadedItems > 0) this.scheduleNavidromeScan(job);
  }

  private scheduleNavidromeScan(job: DownloadJob) {
    const scan = async () => {
      let scanFailed = false;
      try {
        if (await startNavidromeScan()) return;
      } catch { scanFailed = true; }
      if (this.navidromeContainer) {
        try {
          await exec("sudo", ["-n", this.containerCli, "exec", this.navidromeContainer, "navidrome", "scan"], { timeout: 10 * 60_000 });
          return;
        } catch { scanFailed = true; }
      }
      if (!scanFailed) return;
      job.scanWarning = "Downloaded, but Navidrome scan failed. It will appear after the scheduled scan.";
      job.updatedAt = now();
      try { await this.persist(); } catch { /* a scan warning must not break later scans */ }
    };
    this.scanChain = this.scanChain.then(scan, scan);
  }

  private scheduleTransientRetry(job: DownloadJob) {
    job.status = "retrying";
    job.progress = 0;
    job.speed = null;
    job.etaSeconds = null;
    job.itemIndex = null;
    job.itemCount = null;
    job.warningCount = 0;
    job.error = null;
    job.updatedAt = now();
    const timer = setTimeout(() => {
      void (async () => {
        const current = this.jobs.find((candidate) => candidate.id === job.id);
        if (current?.status !== "retrying") return;
        current.status = "queued";
        current.updatedAt = now();
        try { await this.persist(); } catch { /* the next list call can still start the in-memory job */ }
        void this.runWorker();
      })();
    }, TRANSIENT_RETRY_COOLDOWN_MS);
    timer.unref();
  }

  /**
   * Best effort by design: this runs after the download is already on disk, so a leftover
   * scratch directory is a far smaller problem than losing the result over it. The sudo
   * fallback still covers host installs where the scratch root is owned by another user,
   * and simply fails on images that ship without sudo. The next run of the same job id
   * overwrites the directory anyway.
   */
  private async discardScratch(jobId: string) {
    const scratch = join(this.tempDir, jobId);
    try {
      await rm(scratch, { recursive: true, force: true });
    } catch {
      try {
        await exec("sudo", ["-n", "rm", "-rf", "--", scratch]);
      } catch { /* the scratch directory outlives the job */ }
    }
  }

  private async download(job: DownloadJob): Promise<void> {
    if (job.status !== "queued") return;
    const musicRoot = await musicDir();
    if (job.status !== "queued") return;
    if (!musicRoot) {
      job.status = "failed";
      job.error = "No music folder is configured yet.";
      job.updatedAt = now();
      await this.persist();
      return;
    }
    const shortage = await this.freeSpaceShortage(musicRoot);
    if (job.status !== "queued") return;
    if (shortage) {
      job.status = "failed";
      job.error = shortage;
      job.updatedAt = now();
      await this.persist();
      return;
    }
    job.status = "running";
    job.updatedAt = now();
    this.activeJobId = job.id;
    this.lastPersistedProgress = -1;
    await this.persist();
    if (job.format === "lossless" && !job.url && (job.kind === "song" || job.kind === "album")) {
      const controller = new AbortController();
      this.activeAbortController = controller;
      try {
        await this.downloadLossless(job, musicRoot, controller.signal);
      } catch (cause) {
        if (this.jobs.find((candidate) => candidate.id === job.id)?.status !== "cancelled") {
          job.status = "failed";
          job.error = cause instanceof Error ? cause.message.slice(0, 500) : "Lossless download failed.";
          job.updatedAt = now();
          await this.persist();
        }
      } finally {
        this.activeAbortController = null;
        this.activeProcess = null;
        this.activeJobId = null;
        await this.discardScratch(job.id);
      }
      return;
    }
    const errors: string[] = [];
    const downloadedFiles = new Set<string>();
    let child: ReturnType<typeof spawn>;
    try {
      child = await this.downloaderProcess(job, musicRoot);
    } catch (cause) {
      job.status = "failed";
      job.error = cause instanceof Error ? cause.message : "Download VPN is unavailable.";
      job.updatedAt = now();
      this.activeJobId = null;
      await this.persist();
      return;
    }
    this.activeProcess = child;
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("muzik-file:")) {
          const file = safeMusicPath(musicRoot, line.slice("muzik-file:".length));
          if (file && !downloadedFiles.has(file)) {
            downloadedFiles.add(file);
            job.downloadedItems += 1;
            if (job.format === "lossless") job.fallbackItems += 1;
          }
        }
        const progress = parseProgress(line);
        if (!progress) continue;
        Object.assign(job, progress, { updatedAt: now() });
        if (job.progress !== this.lastPersistedProgress) {
          this.lastPersistedProgress = job.progress;
          void this.persist();
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const lines = stderr.split("\n");
      stderr = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("ERROR:")) errors.push(line);
    });
    const exitCode = await new Promise<number>((resolve) => {
      child.once("error", () => resolve(127));
      child.once("close", (code) => resolve(code ?? 1));
    });
    if (stdout.startsWith("muzik-file:")) {
      const file = safeMusicPath(musicRoot, stdout.slice("muzik-file:".length).trim());
      if (file && !downloadedFiles.has(file)) {
        downloadedFiles.add(file);
        job.downloadedItems += 1;
        if (job.format === "lossless") job.fallbackItems += 1;
      }
    }
    if (stderr.startsWith("ERROR:")) errors.push(stderr);
    this.activeProcess = null;
    this.activeJobId = null;
    await this.discardScratch(job.id);
    if (this.jobs.find((candidate) => candidate.id === job.id)?.status === "cancelled") {
      await this.persist();
      return;
    }
    const transientFailure = (
      !job.url
      && job.downloadedItems === 0
      && (exitCode !== 0 || errors.length > 0)
      && isRetryableYoutubeError(errors)
    );
    if (transientFailure) {
      this.scheduleTransientRetry(job);
      await this.persist();
      return;
    }
    job.warningCount = errors.length;
    job.progress = 100;
    job.speed = null;
    job.etaSeconds = null;
    job.updatedAt = now();
    if ((exitCode !== 0 || errors.length > 0) && job.downloadedItems === 0) {
      job.status = "failed";
      job.error = safeError(errors);
    } else {
      job.status = errors.length ? "completed_with_warnings" : "completed";
      const organized = await organizeFiles([...downloadedFiles], musicRoot, this.dataDir);
      await fetchLyrics([...downloadedFiles]);
      if (organized.warnings.length) {
        job.metadataWarning = `Downloaded, but metadata organization had ${organized.warnings.length} warning(s).`;
      }
    }
    await this.persist();
    if (job.downloadedItems > 0 && (job.status === "completed" || job.status === "completed_with_warnings")) {
      this.scheduleNavidromeScan(job);
    }
  }
}

const globalJobs = globalThis as typeof globalThis & { muzikJobStore?: JobStore };
export const jobStore = globalJobs.muzikJobStore ??= new JobStore();
