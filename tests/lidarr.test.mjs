import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { lidarrConnection, lidarrTestConnection, publicLidarrSettings, saveLidarrSettings, saveLyricsEnabled } from "../lib/settings.ts";
import { mapLidarrPath, pendingLidarr, registerLidarr, testLidarrConnection } from "../lib/lidarr.ts";
import { JobStore, upgradeJobs } from "../lib/jobs.ts";

const ENV_NAMES = ["MUZIK_DATA_DIR", "MUZIK_TEMP_DIR", "MUZIK_MUSIC_DIR", "MUZIK_LIDARR_ENABLED",
  "MUZIK_LIDARR_URL", "MUZIK_LIDARR_API_KEY", "MUZIK_LIDARR_MUSIC_DIR", "MUZIK_YTDLP", "MUZIK_MIN_FREE_MB",
  "MUZIK_VPN_CONTAINER", "MUZIK_NAVIDROME_CONTAINER", "MUZIK_LYRICS"];
const FILE = "Artist/Album/01 - Song.m4a";
const ID = "11111111-1111-1111-1111-111111111111";

async function fixture(t) {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  const directory = await mkdtemp(join(tmpdir(), "muzik-lidarr-"));
  const root = join(directory, "music");
  process.env.MUZIK_DATA_DIR = join(directory, "data");
  process.env.MUZIK_TEMP_DIR = join(directory, "scratch");
  process.env.MUZIK_MUSIC_DIR = root;
  await mkdir(dirname(join(root, FILE)), { recursive: true });
  await mkdir(process.env.MUZIK_DATA_DIR, { recursive: true });
  await writeFile(join(root, FILE), "audio fixture");
  const state = {
    requests: [], status: 200, commandStatuses: ["completed"],
    artists: [{ id: 1 }], matched: [{ path: `/media/music/${FILE}`, artistId: 1, albumId: 10 }],
    unmatched: [], roots: [{ path: "/media/music", accessible: true }], submission: { id: 42 },
    delay: 0, redirect: false, block: null, trackDelay: 0, activeTracks: 0, maxActiveTracks: 0,
  };
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    state.requests.push({ method: request.method, url: request.url, key: request.headers["x-api-key"], body: body ? JSON.parse(body) : null });
    if (state.block) await state.block;
    if (state.delay) await sleep(state.delay);
    if (state.redirect) { response.writeHead(302, { Location: "/redirected" }).end(); return; }
    response.setHeader("Content-Type", "application/json");
    if (state.status !== 200) { response.writeHead(state.status).end(JSON.stringify({ error: "upstream secret" })); return; }
    const path = new URL(request.url, "http://localhost").pathname.replace(/^\/base/, "");
    let result = {};
    if (path === "/api/v1/rootfolder") result = state.roots;
    if (path === "/api/v1/command" && request.method === "POST") result = state.submission;
    if (path === "/api/v1/command/42") {
      result = { status: state.commandStatuses[0] };
      if (state.commandStatuses.length > 1) state.commandStatuses.shift();
    }
    if (path === "/api/v1/artist") result = state.artists;
    if (path === "/api/v1/trackfile") {
      state.activeTracks += 1;
      state.maxActiveTracks = Math.max(state.maxActiveTracks, state.activeTracks);
      if (state.trackDelay) await sleep(state.trackDelay);
      const query = new URL(request.url, "http://localhost").searchParams;
      result = query.get("unmapped") === "true" ? state.unmatched : state.matched.filter((file) => file.artistId === Number(query.get("artistId")));
      state.activeTracks -= 1;
    }
    response.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/base`;
  const input = { enabled: true, url, apiKey: "private-key", musicDir: "/media/music" };
  await saveLidarrSettings(input);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const job = upgradeJobs([{ id: ID, kind: "album", sourceId: "PLabcdefghijk", status: "completed",
    title: "Album", subtitle: "Artist", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    downloadRoot: root, downloadedPaths: [FILE], downloadedItems: 1, scanWarning: "Navidrome warning" }])[0];
  return { directory, root, state, server, input, job };
}

test("Lidarr settings preserve secrets and other settings across serialized writes", async (t) => {
  const { input } = await fixture(t);
  const visible = await saveLidarrSettings({ ...input, apiKey: "" });
  assert.equal(visible.apiKeyConfigured, true);
  assert.equal("apiKey" in visible, false);
  assert.equal(visible.configurationError, null);
  await Promise.all([saveLidarrSettings({ ...input, apiKey: "", enabled: false }), saveLyricsEnabled(false)]);
  const file = join(process.env.MUZIK_DATA_DIR, "settings.json");
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.lidarr.enabled, false);
  assert.equal(stored.lidarr.apiKey, "private-key");
  assert.equal(stored.lyrics, false);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await assert.rejects(saveLidarrSettings({ ...input, url: "http://other.example", apiKey: "" }), /new key/);
  assert.equal((await lidarrConnection()).url, input.url);
});

test("Lidarr defaults disabled and old jobs have no registration or paths", async (t) => {
  await fixture(t);
  await rm(join(process.env.MUZIK_DATA_DIR, "settings.json"));
  const visible = await publicLidarrSettings();
  assert.equal(visible.enabled, false);
  assert.equal(visible.apiKeyConfigured, false);
  const old = upgradeJobs([{ id: ID }])[0];
  assert.deepEqual(old.downloadedPaths, []);
  assert.equal(old.downloadRoot, null);
  assert.equal(old.lidarr, null);
});

test("job upgrades reject malformed registration and drop unexpected nested properties", async (t) => {
  const { job } = await fixture(t);
  job.lidarr = { ...await pendingLidarr(job), obsoleteProperty: "discard" };
  assert.equal("obsoleteProperty" in upgradeJobs([job])[0].lidarr, false);
  for (const change of [{ status: "other" }, { commandId: "42" }, { startedAt: "invalid" }, { recognizedFiles: -1 }]) {
    assert.equal(upgradeJobs([{ ...job, lidarr: { ...job.lidarr, ...change } }])[0].lidarr, null);
  }
});

test("Lidarr validates URL, secrets, switches, and Linux roots", async (t) => {
  const { input } = await fixture(t);
  for (const url of ["file:///etc/passwd", "https://user:password@example.com", "http://example.com?a=1", "http://example.com#secret", "not a URL"]) {
    await assert.rejects(saveLidarrSettings({ ...input, url }), /Lidarr URL/);
  }
  for (const musicDir of ["relative", "/", "C:\\music", "/music\0escape"]) await assert.rejects(saveLidarrSettings({ ...input, musicDir }));
  await assert.rejects(saveLidarrSettings({ ...input, enabled: "true" }), /enabled/);
  await assert.rejects(saveLidarrSettings({ ...input, apiKey: "x".repeat(4097) }), /too long/);
});

test("environment overrides are pinned and cannot leak saved credentials to another server", async (t) => {
  const { input } = await fixture(t);
  process.env.MUZIK_LIDARR_ENABLED = "0";
  process.env.MUZIK_LIDARR_URL = "http://other.example/base";
  process.env.MUZIK_LIDARR_MUSIC_DIR = "/mapped";
  let visible = await publicLidarrSettings();
  assert.equal(visible.enabled, false);
  assert.equal(visible.enabledPinned, true);
  assert.equal(visible.urlPinned, true);
  assert.equal(visible.musicDirPinned, true);
  assert.equal(visible.apiKeyConfigured, false);
  assert.equal((await lidarrConnection()).apiKey, "");
  process.env.MUZIK_LIDARR_API_KEY = "environment-key";
  visible = await saveLidarrSettings({ ...input, apiKey: "do not save", enabled: true });
  assert.equal(visible.enabled, false);
  assert.equal(visible.apiKeyPinned, true);
  assert.equal((await lidarrConnection()).apiKey, "environment-key");
  assert.equal(visible.url, "http://other.example/base");
  assert.equal(visible.musicDir, "/mapped");
  const stored = JSON.parse(await readFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), "utf8"));
  assert.equal(stored.lidarr.apiKey, "", "saving a server override cannot rebind the previous server's secret");
  delete process.env.MUZIK_LIDARR_URL;
  await assert.rejects(saveLidarrSettings({ ...input, url: "http://third.example" }), /MUZIK_LIDARR_URL/);
});

test("invalid environment config is visible without breaking the settings page", async (t) => {
  await fixture(t);
  process.env.MUZIK_LIDARR_URL = "javascript:alert(1)";
  const visible = await publicLidarrSettings();
  assert.match(visible.configurationError, /HTTP or HTTPS/);
  assert.equal(visible.apiKeyConfigured, false);
  await assert.rejects(lidarrConnection(), /HTTP or HTTPS/);
});

test("malformed settings errors never quote saved credentials", async (t) => {
  const { input } = await fixture(t);
  await writeFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), 'private-key-is-secret {');
  const visible = await publicLidarrSettings();
  assert.equal(visible.configurationError, "Settings file is invalid. Check settings.json.");
  assert.equal(JSON.stringify(visible).includes("private-key"), false);
  await assert.rejects(saveLidarrSettings(input), { message: "Settings file is invalid. Check settings.json." });
});

test("connection test handles unsaved values and base paths without saving or disclosing keys", async (t) => {
  const { input, state } = await fixture(t);
  const before = await readFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), "utf8");
  const connection = await lidarrTestConnection({ ...input, enabled: false, apiKey: "draft-key" });
  const result = await testLidarrConnection(connection);
  assert.equal(result.lidarrRoot, "/media/music");
  assert.equal(JSON.stringify(result).includes("draft-key"), false);
  assert.ok(state.requests.every((request) => request.url.startsWith("/base/api/v1/") && request.key === "draft-key"));
  assert.equal(await readFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), "utf8"), before);
  state.roots = [{ path: "/media/music-other", accessible: true }];
  await assert.rejects(testLidarrConnection(connection), /accessible Lidarr root/);
  state.roots = [{ path: "/media", accessible: false }];
  await assert.rejects(testLidarrConnection(connection), /accessible Lidarr root/);
});

test("maps paths safely with same and different roots", () => {
  assert.equal(mapLidarrPath("/music", "/media/music", FILE), `/media/music/${FILE}`);
  assert.equal(mapLidarrPath("/music", "/music", FILE), `/music/${FILE}`);
  for (const path of ["", ".", "../escape", "Artist/../../escape", "/music/track.m4a", "Artist/\0song"]) {
    assert.throws(() => mapLidarrPath("/music", "/media/music", path), /outside/);
  }
});

test("registration preserves the download, submits an in-place scan, and confirms recognition", async (t) => {
  const { job, state } = await fixture(t);
  job.lidarr = await pendingLidarr(job);
  const snapshots = [];
  await registerLidarr(job, async () => snapshots.push(structuredClone(job.lidarr)));
  const submission = state.requests.find((request) => request.method === "POST");
  assert.deepEqual(submission.body, { name: "RescanFolders", folders: ["/media/music/Artist/Album"], filter: "none", addNewArtists: false });
  assert.equal(submission.key, "private-key");
  assert.equal(snapshots[0].status, "scanning");
  assert.equal(snapshots[0].commandId, null);
  assert.equal(job.lidarr.status, "recognized");
  assert.equal(job.lidarr.recognizedFiles, 1);
  assert.match(job.lidarr.message, /1 of 1/);
  assert.equal(job.status, "completed");
  assert.equal(job.scanWarning, "Navidrome warning");
  assert.ok(state.requests.every((request) => !request.url.includes("private-key")));
});

test("mixed playlists report unmatched and unreported files, with unique album folders", async (t) => {
  const { job, root, state } = await fixture(t);
  job.kind = "playlist";
  job.status = "completed_with_warnings";
  job.downloadedPaths.push("Artist/Album/02.m4a", "Unknown/Collection/03.m4a");
  for (const path of job.downloadedPaths.slice(1)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), "audio");
  }
  state.unmatched = [{ path: "/media/music/Artist/Album/02.m4a", artistId: 0, albumId: 0 }];
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.match(job.lidarr.message, /1 of 3/);
  assert.equal(job.status, "completed_with_warnings");
  assert.deepEqual(state.requests.find((request) => request.method === "POST").body.folders,
    ["/media/music/Artist/Album", "/media/music/Unknown/Collection"]);
});

test("recognition queries at most four artists concurrently and stops when all files are found", async (t) => {
  const { job, state } = await fixture(t);
  state.artists = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));
  state.matched[0].artistId = 5;
  state.trackDelay = 20;
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "recognized");
  assert.equal(state.maxActiveTracks, 4);
  assert.equal(state.requests.filter((request) => request.url.includes("artistId=")).length, 8);
});

test("all-unmatched scans report counts without querying unrelated artists", async (t) => {
  const { job, state } = await fixture(t);
  state.unmatched = [{ path: `/media/music/${FILE}`, artistId: 0, albumId: 0 }];
  state.artists = null;
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.match(job.lidarr.message, /0 of 1/);
  assert.equal(state.requests.some((request) => request.url.endsWith("/artist")), false);
});

test("malformed scan commands and track records never produce recognition success", async (t) => {
  const { job, state } = await fixture(t);
  for (const submission of [{}, { id: "42" }, { id: -1 }]) {
    state.submission = submission;
    job.lidarr = await pendingLidarr(job);
    await registerLidarr(job, async () => {});
    assert.equal(job.lidarr.status, "warning");
    assert.match(job.lidarr.message, /valid scan command/);
  }
  state.submission = { id: 42 };
  state.matched[0].albumId = "10";
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.match(job.lidarr.message, /invalid track-file/);
});

test("missing files and symlinks outside the music root never reach Lidarr", async (t) => {
  const { job, directory, root, state } = await fixture(t);
  await rm(join(root, FILE));
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.match(job.lidarr.message, /missing or outside/);
  assert.equal(state.requests.length, 0);
  await writeFile(join(directory, "outside.m4a"), "audio");
  await symlink(join(directory, "outside.m4a"), join(root, FILE));
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(state.requests.length, 0);
});

test("authentication errors and redirects are sanitized and do not fail downloads", async (t) => {
  const { job, state } = await fixture(t);
  for (const status of [401, 403, 500]) {
    state.status = status;
    job.lidarr = await pendingLidarr(job);
    await registerLidarr(job, async () => {});
    assert.equal(job.lidarr.status, "warning");
    assert.match(job.lidarr.message, new RegExp(`HTTP ${status}`));
    assert.equal(job.lidarr.message.includes("upstream secret"), false);
    assert.equal(job.status, "completed");
  }
  state.status = 200;
  state.redirect = true;
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.equal(state.requests.some((request) => request.url === "/redirected"), false);
});

test("offline Lidarr becomes a warning", async (t) => {
  const { job, server } = await fixture(t);
  await new Promise((resolve) => server.close(resolve));
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "warning");
  assert.match(job.lidarr.message, /could not be reached/);
  assert.equal(job.status, "completed");
});

test("polling waits for completion and rejects failed commands", async (t) => {
  const { job, state } = await fixture(t);
  state.commandStatuses = ["queued", "completed"];
  job.lidarr = await pendingLidarr(job);
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "recognized");
  for (const status of ["failed", "aborted", "cancelled", "orphaned"]) {
    state.commandStatuses = [status];
    job.lidarr = await pendingLidarr(job);
    await registerLidarr(job, async () => {});
    assert.equal(job.lidarr.status, "warning");
    assert.match(job.lidarr.message, /failed or stopped/);
  }
});

test("restart resumes a known command and does not resubmit uncertain or expired scans", async (t) => {
  const { job, state } = await fixture(t);
  job.lidarr = { ...await pendingLidarr(job), status: "scanning", commandId: 42, startedAt: new Date().toISOString() };
  await registerLidarr(job, async () => {});
  assert.equal(job.lidarr.status, "recognized");
  assert.equal(state.requests.some((request) => request.method === "POST"), false);
  job.lidarr = { ...await pendingLidarr(job), status: "scanning", startedAt: new Date().toISOString() };
  await registerLidarr(job, async () => {});
  assert.match(job.lidarr.message, /interrupted/);
  job.lidarr = { ...await pendingLidarr(job), status: "scanning", commandId: 42, startedAt: "2020-01-01T00:00:00.000Z" };
  await registerLidarr(job, async () => {});
  assert.match(job.lidarr.message, /timed out/);
  assert.equal(state.requests.some((request) => request.method === "POST"), false);
});

test("changed settings require manual retry instead of scanning another server or root", async (t) => {
  const { job, input, state } = await fixture(t);
  for (const change of [{ musicDir: "/other" }, { url: "http://other.example", apiKey: "another-key" }, { enabled: false }]) {
    await saveLidarrSettings(input);
    job.lidarr = await pendingLidarr(job);
    await saveLidarrSettings({ ...input, ...change });
    await registerLidarr(job, async () => {});
    assert.match(job.lidarr.message, /settings changed/);
  }
  assert.equal(state.requests.length, 0);
});

async function settle(store) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const jobs = await store.list();
    if (!jobs.some((job) => ["pending", "scanning"].includes(job.lidarr?.status))) return jobs;
    await sleep(20);
  }
  assert.fail("Lidarr worker did not settle");
}

test("manual retry changes registration only, prevents duplicates, and survives clear-finished", async (t) => {
  const { job, state } = await fixture(t);
  job.lidarr = { ...await pendingLidarr(job), status: "warning" };
  await writeFile(join(process.env.MUZIK_DATA_DIR, "jobs.json"), JSON.stringify([job]));
  const store = new JobStore();
  const retry = await Promise.allSettled([store.retryLidarr(ID), store.retryLidarr(ID)]);
  assert.equal(retry.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(retry.find((result) => result.status === "rejected").reason.message, /already in progress/);
  assert.equal((await store.clearFinished()).length, 1);
  const [completed] = await settle(store);
  assert.equal(completed.lidarr.status, "recognized");
  assert.equal(completed.status, "completed");
  assert.equal(completed.scanWarning, "Navidrome warning");
  assert.equal(state.requests.filter((request) => request.method === "POST").length, 1);
});

test("persisted pending scans resume in the JobStore independently of queued downloads", async (t) => {
  const { job, state } = await fixture(t);
  job.lidarr = await pendingLidarr(job);
  const queued = upgradeJobs([{ id: "22222222-2222-2222-2222-222222222222", status: "queued", kind: "song", sourceId: "abcdefghijk" }])[0];
  await writeFile(join(process.env.MUZIK_DATA_DIR, "jobs.json"), JSON.stringify([job, queued]));
  const store = new JobStore();
  const downloads = [];
  store.download = async (current) => { downloads.push(current.id); current.status = "completed"; };
  const jobs = await settle(store);
  assert.equal(jobs.find((current) => current.id === ID).lidarr.status, "recognized");
  assert.deepEqual(downloads, [queued.id]);
  assert.equal(state.requests.filter((request) => request.method === "POST").length, 1);
});

test("the download pipeline automatically registers successful files from a partial playlist", async (t) => {
  const { job, root, directory, state } = await fixture(t);
  const downloader = join(directory, "downloader.mjs");
  await writeFile(downloader, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(`muzik-file:${join(root, FILE)}`)});\nconsole.error('ERROR: A playlist item is unavailable');\nprocess.exitCode = 1;\n`, { mode: 0o700 });
  process.env.MUZIK_YTDLP = downloader;
  process.env.MUZIK_MIN_FREE_MB = "0";
  process.env.MUZIK_LYRICS = "0";
  Object.assign(job, { kind: "playlist", status: "queued", downloadedItems: 0, downloadedPaths: [], downloadRoot: null, lidarr: null, scanWarning: null });
  await writeFile(join(process.env.MUZIK_DATA_DIR, "jobs.json"), JSON.stringify([job]));
  const store = new JobStore();
  await store.list();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [current] = await store.list();
    if (current.lidarr?.status === "recognized") {
      assert.equal(current.status, "completed_with_warnings");
      assert.equal(current.warningCount, 1);
      assert.deepEqual(current.downloadedPaths, [FILE]);
      assert.equal(current.downloadRoot, root);
      assert.equal(state.requests.filter((request) => request.method === "POST").length, 1);
      return;
    }
    await sleep(25);
  }
  assert.fail("Partial playlist was not registered");
});

test("Lidarr request timeout yields a warning without retrying", async (t) => {
  const { job, state } = await fixture(t);
  let release;
  state.block = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  job.lidarr = await pendingLidarr(job);
  try {
    await registerLidarr(job, async () => {});
    assert.equal(job.lidarr.status, "warning");
    assert.match(job.lidarr.message, /could not be reached/);
    assert.equal(state.requests.length, 1);
  } finally { release(); }
});
