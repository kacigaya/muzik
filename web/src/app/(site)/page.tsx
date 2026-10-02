import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/code-block";
import { DEFAULT_DESCRIPTION, SITE_URL } from "@/lib/seo";

const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/kacigaya/muzik";

const FEATURES = [
  {
    title: "Search and queue",
    description:
      "Search YouTube Music for songs, albums, and playlists, or paste a link. One serial queue with live progress, saved to disk so interrupted jobs come back after a restart.",
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
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_SCHEMA) }}
        />

        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-start">
            <Badge variant="secondary" className="mb-6">
              Self-hosted · yt-dlp · Navidrome · No accounts
            </Badge>
            <h1 className="text-balance font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              Your music, downloaded and organized into files you keep
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              Muzik is a self-hosted web interface for downloading music from
              YouTube Music. It writes tagged, organized files that Navidrome,
              Jellyfin, Plex, or a plain file browser can read.
            </p>
            <p className="mt-4 max-w-2xl text-pretty text-base text-muted-foreground">
              One serial queue, live progress, followed albums, synced lyrics, and
              a choice of m4a, opus, mp3, or transcoded FLAC.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button size="xl" render={<Link href={DOCS_URL} />}>
                Read the docs
              </Button>
              <Button size="xl" variant="outline" render={<a href={GITHUB_URL} />}>
                Star on GitHub
              </Button>
            </div>
          </div>
          <CodeBlock code={INSTALL} lang="bash" />
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <h2 className="mb-8 text-balance font-heading text-3xl font-bold tracking-tight">
            Built to hand you files, not a streaming account
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <CardTitle render={<h3 />}>{feature.title}</CardTitle>
                  <CardDescription render={<p />} className="text-pretty">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Compose */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24">
          <h2 className="mb-6 text-balance font-heading text-3xl font-bold tracking-tight">
            Or run it with Compose
          </h2>
          <div className="max-w-3xl">
            <CodeBlock code={COMPOSE} lang="yaml" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
