import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { lidarrConnection, lidarrTestConnection, publicLidarrSettings, saveLidarrSettings, saveLyricsEnabled } from "../lib/settings.ts";
import { matchAlbum, requestLidarrAlbum, testLidarrConnection } from "../lib/lidarr.ts";
import { validateLidarrRequest } from "../lib/validation.ts";

const ENV_NAMES = ["MUZIK_DATA_DIR", "MUZIK_MUSIC_DIR", "MUZIK_LIDARR_ENABLED", "MUZIK_LIDARR_URL",
  "MUZIK_LIDARR_API_KEY", "MUZIK_LIDARR_ROOT_FOLDER", "MUZIK_LYRICS"];
const ALBUM = {
  title: "Album (Deluxe Edition)", foreignAlbumId: "album-mbid", albumType: "Album",
  artist: { artistName: "Artist", foreignArtistId: "artist-mbid" },
};
const ROOT = { path: "/media/music", accessible: true, defaultQualityProfileId: 2, defaultMetadataProfileId: 3, defaultTags: [5] };

async function fixture(t) {
  const previous = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  const directory = await mkdtemp(join(tmpdir(), "muzik-lidarr-"));
  process.env.MUZIK_DATA_DIR = join(directory, "data");
  process.env.MUZIK_MUSIC_DIR = join(directory, "music");
  await mkdir(process.env.MUZIK_DATA_DIR, { recursive: true });
  const state = {
    requests: [], status: 200, redirect: false, lookup: [ALBUM], existing: [],
    roots: [{ path: "/other", accessible: true, defaultQualityProfileId: 9, defaultMetadataProfileId: 9 }, ROOT],
  };
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const url = new URL(request.url, "http://localhost");
    state.requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
      key: request.headers["x-api-key"], body: body ? JSON.parse(body) : null });
    if (state.redirect) { response.writeHead(302, { Location: "/redirected" }).end(); return; }
    response.setHeader("Content-Type", "application/json");
    if (state.status !== 200) { response.writeHead(state.status).end(JSON.stringify({ error: "upstream secret" })); return; }
    const route = `${request.method} ${url.pathname.replace(/^\/base/, "")}`;
    const results = {
      "GET /api/v1/system/status": {},
      "GET /api/v1/rootfolder": state.roots,
      "GET /api/v1/album/lookup": state.lookup,
      "GET /api/v1/album": state.existing,
      "POST /api/v1/album": { id: 7 },
      "PUT /api/v1/album/monitor": [],
      "POST /api/v1/command": { id: 42 },
    };
    if (!(route in results)) { response.writeHead(404).end("{}"); return; }
    response.end(JSON.stringify(results[route]));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/base`;
  const input = { enabled: true, url, apiKey: "private-key", rootFolder: "/media/music/" };
  await saveLidarrSettings(input);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  return { state, server, input };
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

test("Lidarr defaults disabled and settings from the scan feature keep their connection", async (t) => {
  const { input } = await fixture(t);
  const file = join(process.env.MUZIK_DATA_DIR, "settings.json");
  await rm(file);
  let visible = await publicLidarrSettings();
  assert.equal(visible.enabled, false);
  assert.equal(visible.apiKeyConfigured, false);
  await writeFile(file, JSON.stringify({ musicDir: process.env.MUZIK_MUSIC_DIR,
    lidarr: { enabled: true, url: input.url, apiKey: "private-key", musicDir: "/media/music" } }));
  visible = await publicLidarrSettings();
  assert.equal(visible.enabled, true);
  assert.equal(visible.rootFolder, "");
  assert.equal(visible.apiKeyConfigured, true);
  await saveLidarrSettings({ ...input, apiKey: "" });
  assert.equal("musicDir" in JSON.parse(await readFile(file, "utf8")).lidarr, false);
});

test("Lidarr validates URL, secrets, switches, and root folders", async (t) => {
  const { input } = await fixture(t);
  for (const url of ["file:///etc/passwd", "https://user:password@example.com", "http://example.com?a=1", "http://example.com#secret", "not a URL"]) {
    await assert.rejects(saveLidarrSettings({ ...input, url }), /Lidarr URL/);
  }
  for (const rootFolder of [42, "/music\0escape", "/music\nescape", "x".repeat(1001)]) {
    await assert.rejects(saveLidarrSettings({ ...input, rootFolder }), /root folder/);
  }
  assert.equal((await saveLidarrSettings({ ...input, rootFolder: "  D:\\Music  " })).rootFolder, "D:\\Music");
  await assert.rejects(saveLidarrSettings({ ...input, enabled: "true" }), /enabled/);
  await assert.rejects(saveLidarrSettings({ ...input, apiKey: "x".repeat(4097) }), /too long/);
});

test("environment overrides are pinned and cannot leak saved credentials to another server", async (t) => {
  const { input } = await fixture(t);
  process.env.MUZIK_LIDARR_ENABLED = "0";
  process.env.MUZIK_LIDARR_URL = "http://other.example/base";
  process.env.MUZIK_LIDARR_ROOT_FOLDER = "/mapped";
  let visible = await publicLidarrSettings();
  assert.equal(visible.enabled, false);
  assert.equal(visible.enabledPinned, true);
  assert.equal(visible.urlPinned, true);
  assert.equal(visible.rootFolderPinned, true);
  assert.equal(visible.apiKeyConfigured, false);
  assert.equal((await lidarrConnection()).apiKey, "");
  process.env.MUZIK_LIDARR_API_KEY = "environment-key";
  visible = await saveLidarrSettings({ ...input, apiKey: "do not save", enabled: true });
  assert.equal(visible.enabled, false);
  assert.equal(visible.apiKeyPinned, true);
  assert.equal((await lidarrConnection()).apiKey, "environment-key");
  assert.equal(visible.url, "http://other.example/base");
  assert.equal(visible.rootFolder, "/mapped");
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

test("connection test uses unsaved values and base paths, and requires a usable root folder", async (t) => {
  const { input, state } = await fixture(t);
  const before = await readFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), "utf8");
  const connection = await lidarrTestConnection({ ...input, enabled: false, apiKey: "draft-key" });
  const result = await testLidarrConnection(connection);
  assert.equal(result.rootFolder, "/media/music");
  assert.equal(JSON.stringify(result).includes("draft-key"), false);
  assert.ok(state.requests.every((request) => request.path.startsWith("/base/api/v1/") && request.key === "draft-key"));
  assert.equal(await readFile(join(process.env.MUZIK_DATA_DIR, "settings.json"), "utf8"), before);
  assert.equal((await testLidarrConnection({ ...connection, rootFolder: "" })).rootFolder, "/other");
  for (const roots of [[{ ...ROOT, accessible: false }], [{ ...ROOT, defaultQualityProfileId: 0 }], [{ ...ROOT, path: "/media" }], {}]) {
    state.roots = roots;
    await assert.rejects(testLidarrConnection(connection), /root folder/);
  }
});

test("album matching ignores case, accents, punctuation, and editions, and accepts any credited artist", () => {
  const results = [
    { ...ALBUM, title: "Other Album" },
    { ...ALBUM, foreignAlbumId: "" },
    "invalid",
    { ...ALBUM, title: "Café: Nights [Remastered]", artist: { artistName: "Beyoncé", foreignArtistId: "b" } },
  ];
  assert.equal(matchAlbum(results, "Beyonce & Jay-Z", "CAFE NIGHTS").foreignAlbumId, "album-mbid");
  assert.equal(matchAlbum(results, "Beyonce feat. Jay-Z", "Cafe Nights (Deluxe)").artist.artistName, "Beyoncé");
  assert.equal(matchAlbum(results, "Someone Else", "Cafe Nights"), null);
  assert.equal(matchAlbum(results, "Beyonce", "Cafe"), null);
  assert.equal(matchAlbum(results, "Beyonce", "(Deluxe)"), null);
  assert.throws(() => matchAlbum({}, "Artist", "Album"), /invalid album search/);
});

test("a new album is added monitored with a search, using the root folder's defaults", async (t) => {
  const { state } = await fixture(t);
  const result = await requestLidarrAlbum("Artist", "Album");
  assert.equal(result.added, true);
  assert.match(result.message, /Added Album \(Deluxe Edition\) by Artist/);
  const lookup = state.requests.find((request) => request.path === "/base/api/v1/album/lookup");
  assert.equal(lookup.query.term, "Artist Album");
  assert.equal(state.requests.find((request) => request.path === "/base/api/v1/album" && request.method === "GET").query.foreignAlbumId, "album-mbid");
  const added = state.requests.find((request) => request.method === "POST" && request.path === "/base/api/v1/album").body;
  assert.equal(added.foreignAlbumId, "album-mbid");
  assert.equal(added.monitored, true);
  assert.deepEqual(added.addOptions, { searchForNewAlbum: true });
  assert.equal(added.artist.foreignArtistId, "artist-mbid");
  assert.equal(added.artist.rootFolderPath, "/media/music");
  assert.equal(added.artist.qualityProfileId, 2);
  assert.equal(added.artist.metadataProfileId, 3);
  assert.deepEqual(added.artist.tags, [5]);
  assert.equal(added.artist.monitorNewItems, "none");
  assert.deepEqual(added.artist.addOptions, { monitor: "none", searchForMissingAlbums: false });
  assert.ok(state.requests.every((request) => request.key === "private-key"));
  assert.equal(state.requests.some((request) => request.path === "/base/api/v1/command"), false);
});

test("an album already in Lidarr is monitored and searched instead of added again", async (t) => {
  const { state } = await fixture(t);
  state.existing = [{ id: 11, monitored: false }];
  const result = await requestLidarrAlbum("Artist", "Album");
  assert.equal(result.added, false);
  assert.match(result.message, /already in Lidarr/);
  assert.deepEqual(state.requests.find((request) => request.method === "PUT").body, { albumIds: [11], monitored: true });
  assert.deepEqual(state.requests.find((request) => request.path === "/base/api/v1/command").body, { name: "AlbumSearch", albumIds: [11] });
  assert.equal(state.requests.some((request) => request.method === "POST" && request.path === "/base/api/v1/album"), false);
});

test("unmatched albums, disabled requests, and unusable roots never add anything", async (t) => {
  const { state, input } = await fixture(t);
  state.lookup = [{ ...ALBUM, artist: { artistName: "Cover Band", foreignArtistId: "c" } }];
  await assert.rejects(requestLidarrAlbum("Artist", "Album"), /found no album named "Album" by Artist/);
  state.lookup = [ALBUM];
  state.roots = [{ ...ROOT, accessible: false }];
  await assert.rejects(requestLidarrAlbum("Artist", "Album"), /root folder/);
  assert.equal(state.requests.some((request) => request.method !== "GET"), false);
  state.requests = [];
  await saveLidarrSettings({ ...input, apiKey: "", enabled: false });
  await assert.rejects(requestLidarrAlbum("Artist", "Album"), /Enable Lidarr/);
  assert.equal(state.requests.length, 0);
});

test("upstream errors, offline servers, and redirects are sanitized", async (t) => {
  const { state, server } = await fixture(t);
  for (const status of [401, 403, 500]) {
    state.status = status;
    await assert.rejects(requestLidarrAlbum("Artist", "Album"), (error) =>
      error.message.includes(`HTTP ${status}`) && !error.message.includes("upstream secret"));
  }
  state.status = 200;
  state.redirect = true;
  await assert.rejects(requestLidarrAlbum("Artist", "Album"), /could not be reached/);
  assert.equal(state.requests.some((request) => request.path === "/redirected"), false);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(requestLidarrAlbum("Artist", "Album"), /could not be reached/);
});

test("request validation requires a real artist and album", () => {
  assert.deepEqual(validateLidarrRequest({ artist: " Artist ", album: "Album" }), { artist: "Artist", album: "Album" });
  for (const body of [null, {}, { artist: "Artist" }, { artist: "Artist", album: "" }, { artist: "x".repeat(301), album: "Album" }]) {
    assert.throws(() => validateLidarrRequest(body));
  }
  assert.throws(() => validateLidarrRequest({ artist: "Unknown artist", album: "Album" }), /no album and artist/);
  assert.throws(() => validateLidarrRequest({ artist: "Artist", album: "Unknown album" }), /no album and artist/);
});
