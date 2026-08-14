<p align="center">
  <img src="app/icon.svg" alt="Logo" width="200">
</p>

<h1 align="center">Muzik</h1>

<p align="center">
   <strong>A YouTube Music search and download front end for your own music library.</strong><br>
   <em>Search or paste a link, queue the download, and the tracks land tagged on disk.</em>
</p>

Muzik writes into a directory you choose, in an `Artist/Album/Track` layout that Navidrome,
Jellyfin, Plex, or a plain file browser can read. It has no accounts, no database, and no
external service other than YouTube Music itself.

## Features

- Search songs, albums, and playlists from YouTube Music, with live suggestions while typing
- Paste a YouTube or YouTube Music link instead of searching; a `watch?v=…&list=…` link offers both the single song and the full collection
- Serial download queue with per-job progress, cancel, and retry, persisted to disk and recovered after a restart
- Results show what is already queued, running, or downloaded
- One broad genre assigned per download from MusicBrainz tags, with album artist and album year normalized from the files themselves
- Duplicate protection through a yt-dlp download archive and a queue that refuses to add the same source twice
- Optional links straight into a Navidrome instance, and an optional scan trigger after each download
- Optional routing of all downloads through a VPN container
- Sticky search bar, `/` and `⌘K` shortcuts, light and dark themes, toasts on completion, and a queue bar that follows you on mobile

## Tech stack

- Framework: Next.js 16 (App Router)
- UI: React 19, Tailwind CSS 4, [coss ui](https://coss.com/ui) components on Base UI, Lucide and morphicons
- Language: TypeScript
- Downloader: yt-dlp with ffmpeg
- Metadata: ytmusicapi for search and link resolution, mutagen for tag rewriting, MusicBrainz for genre
- Testing: `node --test` for the TypeScript modules, `unittest` for the Python bridge

## Running with Docker

```bash
docker build -t muzik .
docker run -d --name muzik \
  -p 3020:3020 \
  -v /path/to/your/music:/music \
  -v muzik-data:/data \
  muzik
```

Or with Compose, after pointing the music volume in `compose.yaml` at your library:

```bash
docker compose up -d
```

The image bundles ffmpeg, yt-dlp, and the Python bridges. `/music` is your library and
`/data` holds the queue, the download archive, and the MusicBrainz cache, so keep `/data`
on a volume if you want the queue to survive a restart.

Muzik has no authentication. Bind it to a private interface or put it behind whatever
front end you already use for the rest of your services.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MUZIK_MUSIC_DIR` | `/srv/media-rw/Music` | Library root, also the download target |
| `MUZIK_DATA_DIR` | `/srv/muzik/data` | Queue state, download archive, MusicBrainz artist cache |
| `MUZIK_TEMP_DIR` | `/srv/muzik/tmp` | Per-job scratch space, cleared when the job ends |
| `MUZIK_PYTHON` | `.venv/bin/python` | Interpreter for the search and resolve bridges |
| `MUZIK_YTDLP` | `.venv/bin/yt-dlp` | Downloader binary |
| `NAVIDROME_URL` | unset | Adds links from finished downloads into a Navidrome web UI |
| `MUZIK_NAVIDROME_CONTAINER` | unset | Container to run `navidrome scan --full` in after a download |
| `MUZIK_VPN_CONTAINER` | unset | Container whose network namespace yt-dlp joins |
| `MUZIK_CONTAINER_CLI` | `podman` | Command used for the two options above |

The Docker image overrides the first five so `/music` and `/data` are the defaults there.

`MUZIK_VPN_CONTAINER` and `MUZIK_NAVIDROME_CONTAINER` shell out to a container runtime
through `sudo -n`, which suits a host install more than a container. In Compose, share the
VPN container's network instead:

```yaml
services:
  muzik:
    network_mode: "service:gluetun"
```

Without either variable, yt-dlp uses the network it already has and your library server
picks new files up on its own next scan.

## Running from source

### Prerequisites

- Node.js 22+
- Python 3.12+
- ffmpeg on `PATH`

### Installation

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Validation

```bash
npm test       # node --test plus the Python unittest suite
npm run lint
npm run build
```

`npm run start` serves the production build on `127.0.0.1:3020`. Set `HOST` and `PORT` to
change that.

### Project structure

```
app/            # Next.js App Router entry, layout, and global styles
  api/          # search, resolve, jobs, health
components/     # MuzikApp and the coss ui primitives it uses
lib/            # Queue, downloader, metadata, link parsing, validation
scripts/        # ytmusicapi bridges and the library reorganizer
tests/          # Node and Python tests
```

## How a download works

1. The queue accepts one job at a time and writes every state change to `jobs.json`.
2. yt-dlp extracts audio to m4a, embeds metadata and cover art, and writes to
   `Artist/Album/NN - Title [id].m4a`.
3. Finished files are re-read with mutagen. Album artist and year come from whatever the
   tracks agree on, and the genre comes from the artist's MusicBrainz tags, cached per
   artist and rate limited to one request per second. Unknown artists get `Other`.
4. If a Navidrome container is configured, a full scan runs.

Existing files can be normalized the same way without downloading anything:

```bash
npm run organize
```

The queue keeps the last 100 finished jobs and drops the rest. Jobs that were running when
the process stopped are re-queued at startup. `GET /api/health` answers for uptime checks.

## Notes

Muzik talks to public, anonymous YouTube Music. There is no login, no cookie jar, and no
account of yours involved. Use it for content you are allowed to save.

## License

MIT
