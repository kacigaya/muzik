# Muzik documentation site

The Next.js site published at <https://kacigaya.github.io/muzik/>. It is a static export
built with npm and deployed to GitHub Pages.

## Local development

```bash
cd web
npm install
npm run dev
```

Open <http://localhost:3000>. The local server uses no base path by default.

## Project layout

- `content/` holds the Markdown documentation and its frontmatter.
- `src/app/` holds the routes, layouts, metadata, and global CSS.
- `src/components/` holds site and UI components.
- `src/lib/docs-nav.ts` defines the navigation and, from it, the generated doc routes.
- `public/` holds files copied into the static export, including the social card.

Add a Markdown page under `content/`, then add its route to `src/lib/docs-nav.ts` so the
catch-all route generates it and it appears in the sidebar.

## Checks and static export

Run the same checks GitHub Actions runs:

```bash
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck
NEXT_PUBLIC_BASE_PATH=/muzik npm run build
```

The build writes the static site to `out/`. Set `NEXT_PUBLIC_BASE_PATH` when serving the
export below a subpath. GitHub Pages uses `/muzik`; a root-hosted deployment can leave it
unset.

`public/muzik-og.png` is the 1200x630 social card. It is a committed asset rather than a
generated route, because a static host needs the `.png` extension to serve it as an image.

## Deployment

The [Pages workflow](../.github/workflows/pages.yml) builds and deploys the site after a
push to `main`, or when started manually. Repository Pages settings must use GitHub Actions
as the source. Do not commit `out/` or `.next/`; both are generated and ignored.
