---
title: Development
description: Project structure, the validation pipeline, and what CI runs.
---

# Development

## Setup

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run dev
```

## Validation

```bash
npm test         # node --test plus the Python unittest suite
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs all four on every push and pull request, plus `npm audit` and a build
of the Docker image.

## Project structure

```
app/            # Next.js App Router entry, layout, manifest, and global styles
  api/          # search, resolve, tracks, jobs, subscriptions, library, setup, health
  library/      # Library browser page
components/     # MuzikApp, onboarding, library browser, and the coss ui primitives
lib/            # Queue, downloader, metadata, subscriptions, lyrics, library, validation
scripts/        # ytmusicapi bridges and the library reorganizer
public/         # Icon and service worker
tests/          # Node and Python tests
web/            # This documentation site
instrumentation.ts  # Starts the subscription scheduler with the server
```

## Documentation site

The site in `web/` is a Next.js static export. Pages come from Markdown in `web/content/`,
and navigation is declared in `web/src/lib/docs-nav.ts`. Add a Markdown file, then add its
route to that file so it is generated and appears in the sidebar.

```bash
cd web
npm install
npm run dev
```

Build the static export the way CI does:

```bash
npm run lint
npm run typecheck
NEXT_PUBLIC_BASE_PATH=/muzik npm run build
```

The export is written to `web/out/`. `NEXT_PUBLIC_BASE_PATH` is needed when the site is
served below a subpath, which is how GitHub Pages serves it. A root-hosted deployment can
leave it unset.
