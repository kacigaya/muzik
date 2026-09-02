import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import { MuzikMark } from "@/components/muzik-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { DEFAULT_DESCRIPTION, SITE_URL } from "@/lib/seo";

const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/kacigaya/muzik";
const RELEASES_URL = "https://github.com/kacigaya/muzik/releases";

const FEATURES = [
  {
    title: "Search and queue",
    description:
      "Search YouTube Music for songs, albums, and playlists, or paste a link. One serial queue with live progress, speed, and time remaining.",
  },
  {
    title: "Files you own",
    description:
      "Downloads land as tagged files under Artist/Album/NN - Title, ready for Navidrome, Jellyfin, Plex, or a plain file browser.",
  },
  {
    title: "Followed albums",
    description:
      "Follow an album or playlist and Muzik re-checks it on a schedule, downloading whatever was added since.",
  },
  {
    title: "Authorized lossless",
    description:
      "With your own Qobuz credentials, matched tracks download as native FLAC. Everything else falls back to YouTube AAC or Opus, never mislabeled.",
  },
  {
    title: "Real metadata",
    description:
      "Album artist and year come from what the tracks agree on. One broad genre per download from MusicBrainz tags, cached and rate limited.",
  },
  {
    title: "Synced lyrics",
    description:
      "Optional .lrc files fetched from lrclib.net and written next to each track. Off by default, because it names your tracks to a third party.",
  },
  {
    title: "Survives restarts",
    description:
      "Every queue state change is written to disk. Interrupted jobs come back as queued instead of vanishing.",
  },
  {
    title: "No accounts",
    description:
      "No login, no cookie jar, no telemetry. It refuses to start a download when the disk is nearly full instead of failing halfway.",
  },
];

const INSTALL = `git clone https://github.com/kacigaya/muzik.git
cd muzik
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm run build && npm start`;

const COMPOSE = `services:
  muzik:
    build: .
    ports:
      - "127.0.0.1:3020:3020"
    volumes:
      - /path/to/your/music:/music
      - muzik-data:/data
    restart: unless-stopped

volumes:
  muzik-data:`;

const SOFTWARE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Muzik",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Linux, macOS",
  description: DEFAULT_DESCRIPTION,
  url: SITE_URL,
  license: "https://github.com/kacigaya/muzik/blob/main/LICENSE",
  author: {
    "@type": "Person",
    name: "Gaya KACI",
    url: "https://github.com/kacigaya",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_SCHEMA) }}
      />
      <header className="sticky top-0 z-20 px-4 pt-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border bg-background/70 px-5 py-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <MuzikMark className="size-6" />
            <span className="font-semibold tracking-tight">Muzik</span>
          </div>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" render={<Link href={DOCS_URL} />}>
              Docs
            </Button>
            <Button variant="outline" size="sm" render={<a href={GITHUB_URL} />}>
              GitHub
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-24 text-center">
        <MuzikMark className="mb-8 size-20" />
        <Badge variant="secondary" className="mb-6">
          Self-hosted · yt-dlp · Navidrome · No accounts
        </Badge>
        <h1 className="text-balance font-heading text-5xl font-bold tracking-tight sm:text-6xl">
          Your music, downloaded and organized into files you keep
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Muzik is a self-hosted web interface for downloading music from YouTube Music.
          It writes tagged, organized files that Navidrome, Jellyfin, Plex, or a plain file
          browser can read.
        </p>
        <p className="mt-4 max-w-2xl text-pretty text-base text-muted-foreground">
          One serial queue, live progress, followed albums, synced lyrics, and authorized
          Qobuz lossless when you supply your own credentials.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="xl" render={<Link href={DOCS_URL} />}>
            Read the docs
          </Button>
          <Button size="xl" variant="outline" render={<a href={GITHUB_URL} />}>
            Star on GitHub
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 pb-24">
        <CodeBlock code={INSTALL} lang="bash" />
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <h2 className="mb-10 text-balance text-center font-heading text-3xl font-bold tracking-tight">
          Built to hand you files, not a streaming account
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle render={<h3 />}>{feature.title}</CardTitle>
                <CardDescription render={<p />}>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 pb-24">
        <h2 className="mb-6 text-balance text-center font-heading text-3xl font-bold tracking-tight">
          Or run it with Compose
        </h2>
        <CodeBlock code={COMPOSE} lang="yaml" />
      </section>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Muzik</span>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <Link href={DOCS_URL} className="hover:text-foreground">
              Documentation
            </Link>
            <a href={GITHUB_URL} className="hover:text-foreground">
              GitHub
            </a>
            <a href={RELEASES_URL} className="hover:text-foreground">
              Releases
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
