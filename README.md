<p align="center">
  <img src="app/icon.svg" alt="Muzik logo" width="140">
</p>

<h1 align="center">Muzik</h1>

<p align="center">
   <strong>A YouTube Music search and download front end for your own music library.</strong><br>
   <em>Search or paste a link, queue the download, and the tracks land tagged on disk.</em>
</p>

<p align="center">
  <a href="https://nextjs.org"><img alt="Next.js 16.3.2" src="https://shieldcn.dev/badge/Next.js-16.3.2-171717.svg?variant=secondary&amp;logo=nextdotjs"></a>
  <a href="https://nodejs.org"><img alt="Node.js 22+" src="https://shieldcn.dev/badge/Node.js-22+-5fa04e.svg?variant=secondary&amp;logo=nodedotjs"></a>
  <a href="https://tailwindcss.com"><img alt="Tailwind CSS 4" src="https://shieldcn.dev/badge/Tailwind_CSS-4-06b6d4.svg?variant=secondary&amp;logo=tailwindcss"></a>
  <a href="https://www.docker.com"><img alt="Docker" src="https://shieldcn.dev/badge/Docker-ready-2496ed.svg?variant=secondary&amp;logo=docker"></a>
  <a href="https://github.com/kacigaya/muzik/blob/main/LICENSE"><img alt="MIT License" src="https://shieldcn.dev/github/license/kacigaya/muzik.svg?variant=secondary"></a>
</p>

<p align="center">
  <a href="https://kacigaya.github.io/muzik/"><strong>Documentation</strong></a>
</p>

Muzik writes into a directory you choose, in an `Artist/Album/Track` layout that Navidrome,
Jellyfin, Plex, or a plain file browser can read. It has no accounts and no database.

## Screenshots

### Search and download queue

![YouTube Music search results beside the download queue](public/screenshots/search-and-queue.png)

### Library browser

![Downloaded music organized by artist in the library browser](public/screenshots/library.png)

## Features

- Search songs, albums, and playlists from YouTube Music, or paste a YouTube, YouTube Music, SoundCloud, or Bandcamp link
- Expand an album or playlist and queue only the tracks you want
- Follow a collection and Muzik re-checks it on a schedule, downloading whatever was added since
- Serial queue with live progress, speed, and time remaining, persisted to disk and recovered after a restart
- Pick m4a, opus, mp3, transcoded FLAC, or [authorized Qobuz lossless](https://kacigaya.github.io/muzik/docs/guide/qobuz-lossless/) with native YouTube fallback
- Album artist, album year, and one broad MusicBrainz genre normalized from the files themselves
- Optional synced lyrics written next to each track as `.lrc`
- Optional Navidrome links and a scan trigger after each download
- Optional routing of all downloads through a VPN container
- Installable as a PWA, with `/` and `⌘K` shortcuts and light and dark themes

## Quick start

With Docker:

```bash
docker build -t muzik .
docker run -d --name muzik \
  -p 3020:3020 \
  -v /path/to/your/music:/music \
  -v muzik-data:/data \
  muzik
```

From source, with Node.js 22+, Python 3.12+, and ffmpeg on `PATH`:

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm run dev
```

Muzik asks for a music folder the first time you open it. Set `MUZIK_MUSIC_DIR` to skip
that screen.

**Muzik has no authentication.** Bind it to a private interface or put it behind whatever
front end you already use. See [Deploy](https://kacigaya.github.io/muzik/docs/getting-started/deploy/).

## Documentation

Full documentation lives at **<https://kacigaya.github.io/muzik/>**.

- [Install](https://kacigaya.github.io/muzik/docs/getting-started/install/)
- [Deploy](https://kacigaya.github.io/muzik/docs/getting-started/deploy/)
- [Downloads](https://kacigaya.github.io/muzik/docs/guide/downloads/)
- [Audio formats](https://kacigaya.github.io/muzik/docs/guide/audio-formats/)
- [Qobuz lossless](https://kacigaya.github.io/muzik/docs/guide/qobuz-lossless/)
- [Configuration](https://kacigaya.github.io/muzik/docs/reference/configuration/)
- [Security](https://kacigaya.github.io/muzik/docs/reference/security/)

The site source is in [`web/`](web).

## Development

```bash
npm test         # node --test plus the Python unittest suite
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs all four on every push and pull request, plus `npm audit` and a build
of the Docker image. See
[Development](https://kacigaya.github.io/muzik/docs/reference/development/) for the project
structure.

## Notes

Normal downloads talk to public, anonymous YouTube Music. There is no YouTube login or
cookie jar. Optional Qobuz lossless mode uses only the credentials supplied in the server
environment. Use every source only for content you are allowed to save.

## License

MIT
