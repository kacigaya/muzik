import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseProgress } from "./progress.ts";
import { organizeFiles, safeMusicPath } from "./metadata.ts";
import { musicDir } from "./settings.ts";
import { fetchLyrics } from "./lyrics.ts";
import { externalUrl } from "./sources.ts";
import { defaultFormat } from "./validation.ts";
import { AUDIO_FORMATS, type AudioFormat, type CreateJobRequest, type DownloadJob } from "./types.ts";

const exec = promisify(execFile);
const TERMINAL_LIMIT = 100;
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

/** yt-dlp keeps the best m4a when asked for one, and otherwise re-encodes from the best audio. */
export function formatSelector(format: AudioFormat) {
  return format === "m4a" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio/best";
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
    job.speed ??= null;
    job.etaSeconds ??= null;
  }
  return jobs;
}

export function canCancel(job: Pick<DownloadJob, "status">) {
  return job.status === "queued" || job.status === "running";
}

export function canRetry(job: Pick<DownloadJob, "status">) {
  return job.status === "failed" || job.status === "cancelled";
}

export function recoverJobs(jobs: DownloadJob[], timestamp = now()) {
  for (const job of jobs) {
    if (job.status === "running") {
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

export class JobStore {
  private jobs: DownloadJob[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;
  private activeProcess: ReturnType<typeof spawn> | null = null;
  private activeJobId: string | null = null;
  private workerRunning = false;
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
    const terminal = this.jobs.filter((job) => !["queued", "running"].includes(job.status));
    const keepTerminal = new Set(terminal.slice(0, TERMINAL_LIMIT).map((job) => job.id));
    this.jobs = this.jobs.filter((job) => ["queued", "running"].includes(job.status) || keepTerminal.has(job.id));
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
      (job) => job.kind === request.kind && job.sourceId === request.sourceId && ["queued", "running"].includes(job.status),
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
        await this.download(job);
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
      "--download-archive", join(this.dataDir, "downloaded.txt"),
      "--paths", `home:${musicRoot}`,
      "--paths", `temp:${jobTemp}`,
      "--output", process.env.MUZIK_OUTPUT_TEMPLATE ?? DEFAULT_OUTPUT_TEMPLATE,
      "--format", formatSelector(job.format),
      "--extract-audio",
      "--audio-format", job.format,
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

  private async download(job: DownloadJob) {
    const musicRoot = await musicDir();
    if (!musicRoot) {
      job.status = "failed";
      job.error = "No music folder is configured yet.";
      job.updatedAt = now();
      await this.persist();
      return;
    }
    const shortage = await this.freeSpaceShortage(musicRoot);
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
          job.downloadedItems += 1;
          const file = safeMusicPath(musicRoot, line.slice("muzik-file:".length));
          if (file) downloadedFiles.add(file);
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
      job.downloadedItems += 1;
      const file = safeMusicPath(musicRoot, stdout.slice("muzik-file:".length).trim());
      if (file) downloadedFiles.add(file);
    }
    if (stderr.startsWith("ERROR:")) errors.push(stderr);
    this.activeProcess = null;
    this.activeJobId = null;
    try {
      await rm(join(this.tempDir, job.id), { recursive: true, force: true });
    } catch {
      await exec("sudo", ["-n", "rm", "-rf", "--", join(this.tempDir, job.id)]);
    }
    if (this.jobs.find((candidate) => candidate.id === job.id)?.status === "cancelled") {
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
      if (this.navidromeContainer) {
        try {
          await exec("sudo", ["-n", this.containerCli, "exec", this.navidromeContainer, "navidrome", "scan", "--full"], { timeout: 10 * 60_000 });
        } catch {
          job.scanWarning = "Downloaded, but Navidrome scan failed. It will appear after the scheduled scan.";
        }
      }
    }
    await this.persist();
  }
}

const globalJobs = globalThis as typeof globalThis & { muzikJobStore?: JobStore };
export const jobStore = globalJobs.muzikJobStore ??= new JobStore();
