<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Runtime and validation

- The app uses npm, Next.js App Router, and Python bridges in `.venv`.
- Production binds to `127.0.0.1:3020` by default. Docker uses port `3020`.
- `web/` is the separate documentation site.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `node scripts/audit_dependencies.mjs` for app changes. CI also builds the Docker image.
- Direct audio uses the existing yt-dlp binary at `MUZIK_YTDLP` or `.venv/bin/yt-dlp`. Only YouTube video IDs enter `/api/audio`.
- Likes and playlists share `listening.json` in `MUZIK_DATA_DIR` (default `/srv/muzik/data`). The instance has no accounts. Run one app process per data directory because JSON writes use a process-local lock.
- The browser keeps its own playback queue in `muzik-playback` local storage. It restores paused. Streaming requires no configured download folder.

- Streaming uses `MUZIK_STREAM_PROXY_URL` for both yt-dlp and media bytes. If `MUZIK_VPN_CONTAINER` is set, an absent proxy is an error. Proxy failures never fall back to direct requests.
- `MUZIK_PO_TOKEN_BASE_URL` enables `web_music` and `mweb` before `android_vr` and `web_embedded`. `requirements.txt` pins the matching BgUtils yt-dlp plugin.
- On this host, `muzik-pot.service` runs BgUtils 2.0.2 from `/srv/muzik/bgutil/server`, on `127.0.0.1:4416`. Its deployment lockfile includes compatible security fixes. `/etc/muzik-stream.env` holds private proxy settings and is loaded by a `muzik.service` drop-in. Never print its values.
