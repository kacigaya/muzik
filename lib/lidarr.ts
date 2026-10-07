import { lidarrConnection } from "./settings.ts";

type Connection = Awaited<ReturnType<typeof lidarrConnection>>;
type LookupAlbum = Record<string, unknown> & {
  title: string;
  foreignAlbumId: string;
  artist: Record<string, unknown> & { artistName: string; foreignArtistId: string };
};
type RootFolder = { path: string; defaultQualityProfileId: number; defaultMetadataProfileId: number; defaultTags: number[] };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Do not expose upstream response bodies: they can contain paths, headers, or credentials. */
async function request(connection: Connection, path: string, method = "GET", body?: unknown): Promise<unknown> {
  if (!connection.url || !connection.apiKey) throw new Error("Configure a Lidarr URL and API key in Settings.");
  let response: Response;
  try {
    response = await fetch(new URL(path, `${connection.url}/`), {
      method,
      headers: { "X-Api-Key": connection.apiKey, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Lidarr could not be reached. Check its URL, network, and certificate.");
  }
  if (!response.ok) throw new Error(`Lidarr returned HTTP ${response.status}. Check the connection and API key.`);
  try { return await response.json(); } catch { throw new Error("Lidarr returned an invalid response."); }
}

/** New artists need profiles, which Lidarr stores as defaults on each root folder. */
async function rootFolder(connection: Connection): Promise<RootFolder> {
  const roots = await request(connection, "api/v1/rootfolder");
  if (!Array.isArray(roots)) throw new Error("Lidarr returned invalid root folders.");
  const usable = roots.filter((entry: unknown): entry is RootFolder & { accessible: true } => record(entry)
    && typeof entry.path === "string" && entry.path.length > 0 && entry.accessible === true
    && positiveInteger(entry.defaultQualityProfileId) && positiveInteger(entry.defaultMetadataProfileId));
  const trim = (path: string) => path.replace(/[\\/]+$/, "");
  const root = connection.rootFolder
    ? usable.find((entry) => trim(entry.path) === trim(connection.rootFolder))
    : usable[0];
  if (!root) {
    throw new Error(connection.rootFolder
      ? "The configured Lidarr root folder is missing, inaccessible, or has no default profiles."
      : "Add an accessible root folder with default quality and metadata profiles in Lidarr.");
  }
  const tags = Array.isArray(root.defaultTags) ? root.defaultTags.filter(positiveInteger) : [];
  return { path: root.path, defaultQualityProfileId: root.defaultQualityProfileId, defaultMetadataProfileId: root.defaultMetadataProfileId, defaultTags: tags };
}

export async function testLidarrConnection(connection: Connection) {
  await request(connection, "api/v1/system/status");
  const root = await rootFolder(connection);
  return { rootFolder: root.path, message: `Connected to Lidarr. New artists will be added to ${root.path}.` };
}

/** Case, accents, punctuation, and bracketed edition labels such as "(Deluxe)" differ between catalogs. */
export function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Lidarr's lookup is a fuzzy MusicBrainz search, so only an exact normalized title and
 * artist match is requested. YouTube Music joins collaborators into one artist string,
 * so each credited name is accepted as well as the whole string.
 */
export function matchAlbum(results: unknown, artist: string, album: string): LookupAlbum | null {
  if (!Array.isArray(results)) throw new Error("Lidarr returned invalid album search results.");
  const title = normalizeName(album);
  const artists = new Set([artist, ...artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)].map(normalizeName).filter(Boolean));
  if (!title) return null;
  return results.find((entry: unknown): entry is LookupAlbum => record(entry)
    && typeof entry.title === "string" && typeof entry.foreignAlbumId === "string" && entry.foreignAlbumId.length > 0
    && record(entry.artist) && typeof entry.artist.artistName === "string"
    && typeof entry.artist.foreignArtistId === "string" && entry.artist.foreignArtistId.length > 0
    && normalizeName(entry.title) === title && artists.has(normalizeName(entry.artist.artistName))) ?? null;
}

/**
 * Asks Lidarr to monitor the album and search its indexers. Lidarr then downloads and
 * imports the release itself; Muzik does not track the result. An album already in
 * Lidarr is monitored and searched again rather than added twice.
 */
export async function requestLidarrAlbum(artist: string, album: string) {
  const connection = await lidarrConnection();
  if (!connection.enabled) throw new Error("Enable Lidarr requests in Settings.");
  const term = new URLSearchParams({ term: `${artist} ${album}` });
  const found = matchAlbum(await request(connection, `api/v1/album/lookup?${term}`), artist, album);
  if (!found) throw new Error(`Lidarr found no album named "${album}" by ${artist}.`);
  const label = `${found.title} by ${found.artist.artistName}`;
  const query = new URLSearchParams({ foreignAlbumId: found.foreignAlbumId });
  const existing = await request(connection, `api/v1/album?${query}`);
  if (!Array.isArray(existing)) throw new Error("Lidarr returned invalid album records.");
  const current = existing.find((entry: unknown): entry is { id: number } => record(entry) && positiveInteger(entry.id));
  if (current) {
    await request(connection, "api/v1/album/monitor", "PUT", { albumIds: [current.id], monitored: true });
    await request(connection, "api/v1/command", "POST", { name: "AlbumSearch", albumIds: [current.id] });
    return { album: label, added: false, message: `${label} is already in Lidarr. Lidarr is searching for it again.` };
  }
  const root = await rootFolder(connection);
  // Mirrors Lidarr's own "add album" request. The artist is only used if Lidarr does not
  // have it yet, and monitors nothing else so one request never pulls a discography.
  await request(connection, "api/v1/album", "POST", {
    ...found,
    monitored: true,
    anyReleaseOk: true,
    addOptions: { searchForNewAlbum: true },
    artist: {
      ...found.artist,
      monitored: true,
      monitorNewItems: "none",
      qualityProfileId: root.defaultQualityProfileId,
      metadataProfileId: root.defaultMetadataProfileId,
      rootFolderPath: root.path,
      tags: root.defaultTags,
      addOptions: { monitor: "none", searchForMissingAlbums: false },
    },
  });
  return { album: label, added: true, message: `Added ${label} to Lidarr. Lidarr is searching for it.` };
}
