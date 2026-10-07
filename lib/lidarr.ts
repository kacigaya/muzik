import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { lidarrConnection, musicDir } from "./settings.ts";
import type { DownloadJob, LidarrRegistration } from "./types.ts";

type Connection = Awaited<ReturnType<typeof lidarrConnection>>;
type TrackFile = { path: string; artistId: number; albumId: number };
const POLL_MS = 2_000;
const SCAN_TIMEOUT_MS = 5 * 60_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function upgradeLidarr(value: unknown): LidarrRegistration | null {
  if (!record(value)) return null;
  const { status, serverUrl, musicRoot, lidarrRoot, message, startedAt, commandId, recognizedFiles } = value;
  if ((status !== "pending" && status !== "scanning" && status !== "recognized" && status !== "warning")
    || typeof serverUrl !== "string" || typeof musicRoot !== "string"
    || typeof lidarrRoot !== "string" || typeof message !== "string"
    || (startedAt !== null && (typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))))
    || (commandId !== null && (typeof commandId !== "number" || !Number.isSafeInteger(commandId) || commandId <= 0))
    || typeof recognizedFiles !== "number" || !Number.isSafeInteger(recognizedFiles) || recognizedFiles < 0) return null;
  return { status, serverUrl, musicRoot, lidarrRoot, message, startedAt, commandId, recognizedFiles };
}

function within(root: string, path: string) {
  const local = relative(root, path);
  return local === "" || (!isAbsolute(local) && local !== ".." && !local.startsWith("../"));
}

export function mapLidarrPath(root: string, lidarrRoot: string, path: string) {
  if (!path || isAbsolute(path) || path.includes("\0") || path.split("/").includes("..")) {
    throw new Error("Downloaded path is outside the music folder.");
  }
  const local = resolve(root, path);
  const mapped = resolve(lidarrRoot, path);
  if (local === resolve(root) || !within(resolve(root), local) || !within(resolve(lidarrRoot), mapped)) {
    throw new Error("Downloaded path is outside the music folder.");
  }
  return mapped;
}

/** Do not expose upstream response bodies: they can contain paths, headers, or credentials. */
async function request(connection: Connection, path: string, body?: Record<string, unknown>): Promise<unknown> {
  if (!connection.url || !connection.apiKey) throw new Error("Configure a Lidarr URL and API key in Settings.");
  let response: Response;
  try {
    response = await fetch(new URL(path, `${connection.url}/`), {
      method: body ? "POST" : "GET",
      headers: { "X-Api-Key": connection.apiKey, ...(body && { "Content-Type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Lidarr could not be reached. Check its URL, network, and certificate.");
  }
  if (!response.ok) throw new Error(`Lidarr returned HTTP ${response.status}. Check the connection and API key.`);
  try { return await response.json(); } catch { throw new Error("Lidarr returned an invalid response."); }
}

export async function testLidarrConnection(connection: Connection, root?: string) {
  const localRoot = root ?? await musicDir();
  if (!localRoot) throw new Error("Choose a music folder before configuring Lidarr.");
  await request(connection, "api/v1/system/status");
  const roots = await request(connection, "api/v1/rootfolder");
  const lidarrRoot = resolve(connection.musicDir || localRoot);
  if (!Array.isArray(roots) || !roots.some((entry: unknown) => record(entry)
    && typeof entry.path === "string" && isAbsolute(entry.path) && entry.accessible === true
    && within(resolve(entry.path), lidarrRoot))) {
    throw new Error("The mapped music folder must be inside an accessible Lidarr root folder.");
  }
  return { lidarrRoot, message: "Connected to Lidarr. The mapped music root is accessible." };
}

export async function pendingLidarr(job: DownloadJob): Promise<LidarrRegistration | null> {
  const connection = await lidarrConnection();
  if (!connection.enabled) return null;
  const root = await musicDir();
  if (!root || job.downloadRoot !== root) throw new Error("The download's music folder changed. Restore its original folder before retrying.");
  return {
    status: "pending", commandId: null, serverUrl: connection.url,
    musicRoot: root, lidarrRoot: resolve(connection.musicDir || root), startedAt: null,
    recognizedFiles: 0, message: "Waiting to register files in Lidarr.",
  };
}

async function existingPaths(job: DownloadJob, registration: LidarrRegistration) {
  if (!job.downloadedPaths.length) throw new Error("No downloaded file paths are available for this job.");
  const actualRoot = await realpath(registration.musicRoot);
  const paths = [];
  for (const path of job.downloadedPaths) {
    const mapped = mapLidarrPath(registration.musicRoot, registration.lidarrRoot, path);
    try {
      const local = join(registration.musicRoot, path);
      if (!within(actualRoot, await realpath(local)) || !(await stat(local)).isFile()) {
        throw new Error("Invalid file");
      }
    } catch {
      throw new Error("A downloaded file is missing or outside the music folder. Restore it before retrying Lidarr.");
    }
    paths.push(mapped);
  }
  return new Set(paths);
}

function trackFiles(value: unknown): TrackFile[] {
  if (!Array.isArray(value) || !value.every((entry: unknown): entry is TrackFile => record(entry)
    && typeof entry.path === "string" && isAbsolute(entry.path)
    && typeof entry.artistId === "number" && Number.isSafeInteger(entry.artistId)
    && typeof entry.albumId === "number" && Number.isSafeInteger(entry.albumId))) {
    throw new Error("Lidarr returned invalid track-file records.");
  }
  return value;
}

async function recognition(connection: Connection, paths: Set<string>) {
  const remaining = new Set(paths);
  let unmatched = 0;
  for (const file of trackFiles(await request(connection, "api/v1/trackfile?unmapped=true"))) {
    if (remaining.delete(resolve(file.path))) unmatched += 1;
  }
  if (!remaining.size) return { recognized: 0, unmatched, missing: 0 };
  const artists = await request(connection, "api/v1/artist");
  if (!Array.isArray(artists) || !artists.every((artist: unknown): artist is { id: number } => record(artist)
    && typeof artist.id === "number" && Number.isSafeInteger(artist.id) && artist.id > 0)) {
    throw new Error("Lidarr returned invalid artist records.");
  }
  let recognized = 0;
  for (let offset = 0; offset < artists.length && remaining.size; offset += 4) {
    const batch = artists.slice(offset, offset + 4);
    const files = await Promise.all(batch.map(async (artist) => trackFiles(await request(connection, `api/v1/trackfile?artistId=${artist.id}`))));
    for (const file of files.flat()) {
      if (file.artistId > 0 && file.albumId > 0 && remaining.delete(resolve(file.path))) recognized += 1;
    }
  }
  return { recognized, unmatched, missing: remaining.size };
}

/** State is persisted before submission so an uncertain request is never replayed after restart. */
export async function registerLidarr(job: DownloadJob, persist: () => Promise<void>) {
  const registration = job.lidarr;
  if (!registration) return;
  try {
    const connection = await lidarrConnection();
    const root = await musicDir();
    if (!connection.enabled || connection.url !== registration.serverUrl || root !== registration.musicRoot
      || resolve(connection.musicDir || root || "/") !== registration.lidarrRoot) {
      throw new Error("Lidarr settings changed. Retry registration using the current settings.");
    }
    const paths = await existingPaths(job, registration);
    if (registration.status === "scanning" && !registration.commandId) {
      throw new Error("Lidarr scan submission was interrupted. Check Lidarr, then retry registration.");
    }
    await testLidarrConnection(connection, root);
    if (!registration.commandId) {
      registration.status = "scanning";
      registration.startedAt = new Date().toISOString();
      registration.message = "Requesting a Lidarr scan.";
      job.updatedAt = new Date().toISOString();
      await persist();
      const command = await request(connection, "api/v1/command", {
        name: "RescanFolders", folders: [...new Set([...paths].map((path) => dirname(path)))],
        filter: "none", addNewArtists: false,
      });
      if (!record(command) || !Number.isSafeInteger(command.id) || Number(command.id) <= 0) {
        throw new Error("Lidarr did not return a valid scan command. Check Lidarr before retrying.");
      }
      registration.commandId = Number(command.id);
      registration.message = "Lidarr is scanning downloaded files.";
      job.updatedAt = new Date().toISOString();
      await persist();
    }
    const deadline = Date.parse(registration.startedAt ?? "") + SCAN_TIMEOUT_MS;
    while (true) {
      if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error("Lidarr scan timed out. Check Lidarr, then retry registration.");
      const command = await request(connection, `api/v1/command/${registration.commandId}`);
      if (!record(command) || typeof command.status !== "string") throw new Error("Lidarr returned an invalid scan status.");
      if (command.status === "completed") break;
      if (!["queued", "started"].includes(command.status)) throw new Error("Lidarr scan failed or stopped. Check Lidarr, then retry registration.");
      await sleep(POLL_MS);
    }
    const result = await recognition(connection, paths);
    registration.recognizedFiles = result.recognized;
    registration.status = result.recognized === paths.size ? "recognized" : "warning";
    registration.message = `Lidarr recognized ${result.recognized} of ${paths.size} files.`;
    if (result.unmatched || result.missing) {
      registration.message += " Review unmatched files and existing artists in Lidarr, then retry.";
    }
  } catch (cause) {
    registration.status = "warning";
    registration.message = cause instanceof Error ? cause.message : "Lidarr registration failed. Retry registration.";
  }
  job.updatedAt = new Date().toISOString();
  await persist();
}
