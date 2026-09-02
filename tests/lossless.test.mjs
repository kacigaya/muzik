import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadQobuzFlac,
  hasFlacSignature,
  losslessRelativePath,
  matchScore,
  qobuzQuality,
  qobuzQualityLadder,
  resolveQobuz,
  signQobuzFileUrl,
} from "../lib/lossless.ts";
import { qobuzCdnHosts, qobuzStreamUrl } from "../lib/sources.ts";

const QOBUZ_ENV = [
  "MUZIK_QOBUZ_APP_ID",
  "MUZIK_QOBUZ_APP_SECRET",
  "MUZIK_QOBUZ_USER_AUTH_TOKEN",
  "MUZIK_QOBUZ_QUALITY",
  "MUZIK_QOBUZ_CDN_HOSTS",
];

function configure(t, quality = "27") {
  process.env.MUZIK_QOBUZ_APP_ID = "issued-app";
  process.env.MUZIK_QOBUZ_APP_SECRET = "issued-secret";
  process.env.MUZIK_QOBUZ_USER_AUTH_TOKEN = "entitled-user";
  process.env.MUZIK_QOBUZ_QUALITY = quality;
  process.env.MUZIK_QOBUZ_CDN_HOSTS = "cdn.qobuz.test";
  t.after(() => QOBUZ_ENV.forEach((name) => delete process.env[name]));
}

const CANDIDATE = {
  id: 123456,
  title: "Enjoy the Silence",
  duration: 244,
  track_number: 6,
  media_number: 1,
  performer: { name: "Depeche Mode" },
  album: {
    title: "Violator",
    artist: { name: "Depeche Mode" },
    image: { large: "https://static.qobuz.com/images/covers/a/b/c.jpg" },
    release_date_original: "1990-03-19",
  },
};

const TARGET = {
  title: "Enjoy the Silence",
  artist: "Depeche Mode",
  album: "Violator",
  durationSeconds: 244,
  trackNumber: 6,
};

test("signs Qobuz file URL requests with the documented field order", () => {
  assert.deepEqual(signQobuzFileUrl(123456, 27, "secret", 1_700_000_000), {
    request_ts: 1_700_000_000,
    request_sig: "69fed27e27f175dcdf87ee7739727f1e",
    track_id: "123456",
    format_id: "27",
    intent: "stream",
  });
});

test("uses only the configured quality and lower FLAC tiers", (t) => {
  configure(t, "7");
  assert.equal(qobuzQuality(), 7);
  assert.deepEqual(qobuzQualityLadder(), [7, 6]);
  process.env.MUZIK_QOBUZ_QUALITY = "5";
  assert.equal(qobuzQuality(), 27, "MP3 cannot become the preferred lossless tier");
  assert.deepEqual(qobuzQualityLadder(), [27, 7, 6]);
});

test("requires exact title, artist, album, version, track, and bounded duration", () => {
  assert.ok(matchScore(CANDIDATE, TARGET));
  assert.equal(matchScore({ ...CANDIDATE, album: { ...CANDIDATE.album, title: "Music for the Masses" } }, TARGET), null);
  assert.equal(matchScore({ ...CANDIDATE, duration: 253 }, TARGET), null);
  assert.ok(matchScore({ ...CANDIDATE, duration: 252 }, TARGET), "eight seconds is the accepted boundary");
  assert.equal(matchScore({ ...CANDIDATE, version: "Live" }, TARGET), null);
  assert.equal(matchScore({ ...CANDIDATE, version: "2011 Remaster" }, TARGET), null);
  assert.ok(matchScore(
    { ...CANDIDATE, title: "Enjoy the Silence", version: "2011 Remaster" },
    { ...TARGET, title: "Enjoy the Silence (2011 Remaster)" },
  ));
  assert.equal(matchScore(
    { ...CANDIDATE, title: "Enjoy the Silence", version: "2021 Remaster" },
    { ...TARGET, title: "Enjoy the Silence (2011 Remaster)" },
  ), null);
  assert.equal(matchScore({ ...CANDIDATE, track_number: 7 }, TARGET), null);
  assert.equal(matchScore({ ...CANDIDATE, performer: { name: "Cover Band" }, album: { ...CANDIDATE.album, artist: { name: "Cover Band" } } }, TARGET), null);
});

test("accepts only HTTPS Qobuz stream hosts from the operator allowlist", (t) => {
  configure(t);
  assert.equal(qobuzStreamUrl("https://cdn.qobuz.test/audio.flac"), "https://cdn.qobuz.test/audio.flac");
  assert.equal(qobuzStreamUrl("https://edge.cdn.qobuz.test/audio.flac"), "https://edge.cdn.qobuz.test/audio.flac");
  assert.equal(qobuzStreamUrl("http://cdn.qobuz.test/audio.flac"), null);
  assert.equal(qobuzStreamUrl("https://cdn.qobuz.test.evil.example/audio.flac"), null);
  assert.equal(qobuzStreamUrl("https://user:pass@cdn.qobuz.test/audio.flac"), null);
  process.env.MUZIK_QOBUZ_CDN_HOSTS = "cdn.qobuz.test,*.evil.test,https://evil.test/path,host..test";
  assert.deepEqual(qobuzCdnHosts(), ["cdn.qobuz.test"]);
});

test("resolves an exact match and steps 27, 7, 6 without accepting MP3", async (t) => {
  configure(t);
  const requested = [];
  const fakeFetch = async (input, init) => {
    const url = new URL(input);
    assert.equal(init.headers["X-App-Id"], "issued-app");
    assert.equal(init.headers["X-User-Auth-Token"], "entitled-user");
    if (url.pathname.endsWith("/track/search")) {
      return Response.json({ tracks: { items: [CANDIDATE] } });
    }
    const quality = Number(url.searchParams.get("format_id"));
    requested.push(quality);
    assert.match(url.searchParams.get("request_sig"), /^[a-f0-9]{32}$/);
    if (quality === 27) return new Response("restricted", { status: 403 });
    if (quality === 7) return Response.json({ url: "https://cdn.qobuz.test/mp3", format_id: 5, mime_type: "audio/mpeg" });
    return Response.json({
      url: "https://cdn.qobuz.test/native.flac",
      format_id: 6,
      mime_type: "audio/flac",
      bit_depth: 16,
      sampling_rate: 44.1,
    });
  };
  const stream = await resolveQobuz(TARGET, { fetchImpl: fakeFetch });
  assert.deepEqual(requested, [27, 7, 6]);
  assert.equal(stream.formatId, 6);
  assert.equal(stream.title, TARGET.title);
  assert.equal(stream.artworkUrl, CANDIDATE.album.image.large);
});

test("falls back cleanly on no match, entitlement failure, and timeout", async (t) => {
  configure(t);
  assert.equal(await resolveQobuz(TARGET, { fetchImpl: async () => Response.json({ tracks: { items: [] } }) }), null);
  assert.equal(await resolveQobuz(TARGET, { fetchImpl: async () => new Response("forbidden", { status: 403 }) }), null);
  assert.equal(await resolveQobuz(TARGET, { fetchImpl: async () => { throw new DOMException("timed out", "TimeoutError"); } }), null);
});

test("validates redirects and FLAC bytes while cleaning partial files", async (t) => {
  configure(t);
  const folder = await mkdtemp(join(tmpdir(), "muzik-qobuz-"));
  const destination = join(folder, "track.flac");
  const bytes = Uint8Array.from([0x66, 0x4c, 0x61, 0x43, 0, 1, 2, 3]);
  let calls = 0;
  await downloadQobuzFlac("https://cdn.qobuz.test/start", destination, {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 302, headers: { location: "https://edge.cdn.qobuz.test/file" } })
        : new Response(bytes, { headers: { "content-length": String(bytes.length) } });
    },
  });
  assert.equal(hasFlacSignature(await readFile(destination)), true);

  const rejected = join(folder, "rejected.flac");
  await assert.rejects(
    () => downloadQobuzFlac("https://cdn.qobuz.test/start", rejected, {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/audio" } }),
    }),
    /outside the CDN allowlist/,
  );
  await assert.rejects(() => stat(`${rejected}.part`), { code: "ENOENT" });

  const invalid = join(folder, "invalid.flac");
  await assert.rejects(
    () => downloadQobuzFlac("https://cdn.qobuz.test/file", invalid, {
      fetchImpl: async () => new Response("not flac"),
    }),
    /non-FLAC/,
  );
  await assert.rejects(() => stat(`${invalid}.part`), { code: "ENOENT" });
});

test("builds safe lossless paths that retain the YouTube source ID", () => {
  const path = losslessRelativePath({
    url: "https://cdn.qobuz.test/file",
    formatId: 6,
    bitDepth: 16,
    samplingRate: 44.1,
    trackId: "123",
    artist: "Artist/Name",
    albumArtist: "Artist/Name",
    album: "../Album%Name",
    title: "Song: Name",
    trackNumber: 2,
    discNumber: 1,
    durationSeconds: 180,
    releaseDate: null,
    copyright: null,
    artworkUrl: null,
  }, "abcdefghijk");
  assert.equal(path, "Artist Name/Album Name/02 - Song Name [abcdefghijk].flac");
});

test("keeps a hostile source ID from escaping the library path", () => {
  const stream = {
    url: "https://cdn.qobuz.test/file",
    formatId: 6,
    bitDepth: 16,
    samplingRate: 44.1,
    trackId: "123",
    artist: "Artist",
    albumArtist: "Artist",
    album: "Album",
    title: "Song",
    trackNumber: 2,
    discNumber: 1,
    durationSeconds: 180,
    releaseDate: null,
    copyright: null,
    artworkUrl: null,
  };
  // Separators are gone, so the id stays one path component however ugly it reads.
  assert.equal(losslessRelativePath(stream, "../../etc/passwd"), "Artist/Album/02 - Song [.. etc passwd].flac");
  assert.equal(losslessRelativePath(stream, ".."), "Artist/Album/02 - Song [unknown].flac");
  assert.equal(losslessRelativePath(stream, ""), "Artist/Album/02 - Song [unknown].flac");
  assert.equal(losslessRelativePath(stream, "a/../../b").split("/").length, 3);
});
