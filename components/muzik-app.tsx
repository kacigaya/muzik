"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellOff, Heart, ListMusic, Music2, Pause, Play, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { focusSearch } from "@/components/app-shell";
import { Artwork } from "@/components/artwork";
import { useDownloads } from "@/components/downloads-provider";
import { useListening } from "@/components/listening-provider";
import { CollectionTile, collectionHref, DownloadControl, isPlayable, loadTracks, SectionHeading, Shelf, TileGrid, TrackList } from "@/components/music-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { toastManager } from "@/components/ui/toast";
import { isMusicLink } from "@/lib/link";
import { formatTime } from "@/lib/music";
import type { SearchItem, SearchResponse, Subscription } from "@/lib/types";

type GroupKey = keyof Pick<SearchResponse, "songs" | "albums" | "playlists">;

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "playlists", label: "Playlists" },
];

function linkResults(url: string, items: SearchItem[]): SearchResponse {
  return {
    query: url,
    songs: items.filter((item) => item.kind === "song"),
    albums: items.filter((item) => item.kind === "album"),
    playlists: items.filter((item) => item.kind === "playlist"),
  };
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{children}</kbd>;
}

export function MuzikApp({ lidarrEnabled, downloadsConfigured }: { lidarrEnabled: boolean; downloadsConfigured: boolean }) {
  const query = (useSearchParams().get("q") ?? "").trim();
  return query.length >= 2 ? <SearchResults key={query} query={query} lidarr={lidarrEnabled} /> : <Home downloadsConfigured={downloadsConfigured} />;
}

function Home({ downloadsConfigured }: { downloadsConfigured: boolean }) {
  const { current, queue, paused, toggle, library, loading } = useListening();
  const { subscriptions } = useDownloads();
  return (
    <div className="px-3 pt-4 pb-12 sm:px-5">
      {current ? (
        <section aria-labelledby="continue-title" className="rounded-xl border p-5 sm:p-6">
          <h1 className="sr-only">Home</h1>
          <div className="flex flex-col gap-5 @xl:flex-row @xl:items-end">
            <Artwork src={current.thumbnail} className="size-28 rounded-lg shadow-lg @xl:size-36" eager />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{paused ? "Continue listening" : "Now playing"}</p>
              <h2 id="continue-title" className="mt-1 text-3xl font-bold tracking-tight text-balance break-words @3xl:text-4xl">{current.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {current.artist ?? current.subtitle} · track <span className="font-mono tabular-nums">{queue.index + 1}</span> of <span className="font-mono tabular-nums">{queue.tracks.length}</span>
              </p>
              <Button size="icon-lg" className="mt-4 rounded-full before:rounded-full" aria-label={paused ? `Play ${current.title}` : `Pause ${current.title}`} onClick={toggle}>
                {paused ? <Play aria-hidden="true" className="fill-current" /> : <Pause aria-hidden="true" className="fill-current" />}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section aria-labelledby="home-title" className="rounded-xl border p-6 sm:p-8">
          <h1 id="home-title" className="text-3xl font-bold tracking-tight text-balance @3xl:text-5xl">What do you want to listen to?</h1>
          <p className="mt-3 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">Stream songs, albums, and playlists from YouTube Music. Keep your favorites and download music to your library.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={focusSearch}><Search aria-hidden="true" />Search music</Button>
            <p className="text-xs text-muted-foreground">Press <Kbd>/</Kbd> or <Kbd>⌘K</Kbd> from any page.</p>
          </div>
        </section>
      )}
      {!downloadsConfigured && <p className="mt-3 px-2 text-xs text-muted-foreground">Streaming is ready. <Link href="/settings" className="underline">Set up a download folder</Link> to save audio files.</p>}

      <div className="mt-10">
        <Shelf id="your-playlists" title="Your playlists" action={<Button variant="ghost" size="xs" className="text-muted-foreground" render={<Link href="/saved" />}>Open saved music</Button>}>
          {loading ? Array.from({ length: 4 }, (_, index) => <li key={index} className="p-2"><Skeleton className="aspect-square w-full rounded-lg" /><Skeleton className="mt-2 h-3.5 w-2/3" /></li>) : (
            <>
              <PlaylistTile href="/saved" title="Liked songs" meta={`${library.likes.length} songs`} art={<span className="flex aspect-square w-full items-center justify-center rounded-lg bg-primary text-primary-foreground"><Heart aria-hidden="true" className="size-10 fill-current" /></span>} />
              {library.playlists.map((playlist) => (
                <PlaylistTile key={playlist.id} href={`/saved?playlist=${playlist.id}`} title={playlist.name} meta={`${playlist.tracks.length} songs`} art={<Artwork src={playlist.tracks[0]?.thumbnail} icon={ListMusic} className="aspect-square w-full rounded-lg" />} />
              ))}
            </>
          )}
        </Shelf>
      </div>

      {subscriptions.length > 0 && <Following subscriptions={subscriptions} />}
    </div>
  );
}

function PlaylistTile({ href, title, meta, art }: { href: string; title: string; meta: string; art: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="block rounded-xl p-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        {art}
        <span className="mt-2 block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}

function Following({ subscriptions }: { subscriptions: Subscription[] }) {
  const { toggleFollow } = useDownloads();
  return (
    <section aria-labelledby="following-title" className="mt-10">
      <SectionHeading id="following-title" title="Following" />
      <p className="px-2 pb-2 text-xs text-muted-foreground">Muzik checks these for new tracks and downloads them.</p>
      <ul className="grid @3xl:grid-cols-2 @3xl:gap-x-2">
        {subscriptions.map((subscription) => {
          const item: SearchItem = { kind: subscription.kind, sourceId: subscription.sourceId, title: subscription.title, subtitle: subscription.subtitle, artist: null, album: null, thumbnail: subscription.thumbnail, durationSeconds: null, trackNumber: null, itemCount: null };
          return (
            <li key={subscription.id} className="flex min-w-0 items-center gap-1 rounded-lg pe-1 hover:bg-accent">
              <Link href={collectionHref(item)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Artwork src={subscription.thumbnail} icon={Bell} className="size-10" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{subscription.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Every <span className="font-mono tabular-nums">{subscription.intervalHours}h</span>
                    {subscription.lastCheckedAt && ` · checked ${new Date(subscription.lastCheckedAt).toLocaleDateString()}`}
                  </span>
                </span>
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label={`Stop following ${subscription.title}`} onClick={() => void toggleFollow(item)}><BellOff aria-hidden="true" /></Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SearchResults({ query, lidarr }: { query: string; lidarr: boolean }) {
  const { play } = useListening();
  const [state, setState] = useState<{ results: SearchResponse | null; error: string | null }>({ results: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const link = isMusicLink(query);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const endpoint = link ? `/api/resolve?url=${encodeURIComponent(query)}` : `/api/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setState({ results: link ? linkResults(query, data.items as SearchItem[]) : data as SearchResponse, error: null });
      } catch (cause) {
        if (!controller.signal.aborted) setState({ results: null, error: cause instanceof Error && cause.message ? cause.message : "Search failed." });
      }
    })();
    return () => controller.abort();
  }, [query, link, attempt]);

  const { results, error } = state;
  const total = results ? GROUPS.reduce((sum, group) => sum + results[group.key].length, 0) : 0;
  const top = results ? results.songs[0] ?? results.albums[0] ?? results.playlists[0] : undefined;

  return (
    <div className="px-3 pt-5 pb-12 sm:px-5" aria-busy={!results && !error}>
      <div className="flex min-h-8 items-center justify-between gap-4 px-2">
        <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">{link ? "Found in this link" : `Results for “${query}”`}</h1>
        {results && <Badge variant="secondary" className="shrink-0 font-mono tabular-nums">{total} found</Badge>}
      </div>

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border p-4" role="alert">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{link ? "This link did not open" : "Search did not finish"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => { setState({ results: null, error: null }); setAttempt((value) => value + 1); }}><RefreshCw aria-hidden="true" />Try again</Button>
          </div>
        </div>
      ) : !results ? (
        <div className="mt-6">
          <p className="px-2 pb-2 text-xs text-muted-foreground" role="status">{link ? "Opening the link…" : "Searching YouTube Music…"}</p>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-2 py-1.5">
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
              <Skeleton className="h-3 w-9" />
            </div>
          ))}
        </div>
      ) : !total || !top ? (
        <Empty className="mt-6 rounded-xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia><Music2 aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>{link ? "Nothing to play in this link" : `No results for “${query}”`}</EmptyTitle>
            <EmptyDescription>Check the spelling, or paste a YouTube Music link to open it directly.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={focusSearch}>Change search</Button></EmptyContent>
        </Empty>
      ) : (
        <Tabs defaultValue="all" className="mt-3">
          <TabsList variant="underline" aria-label="Filter search results" className="px-1">
            <TabsTab value="all">All</TabsTab>
            {GROUPS.map((group) => (
              <TabsTab key={group.key} value={group.key}>
                {group.label}
                <Badge variant="secondary" size="sm" className="font-mono tabular-nums">{results[group.key].length}</Badge>
              </TabsTab>
            ))}
          </TabsList>
          <TabsPanel value="all" className="pt-4">
            <div className="grid gap-6 @3xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <TopResult item={top} />
              {results.songs.length > 0 && (
                <section aria-labelledby="top-songs" className="min-w-0">
                  <h2 id="top-songs" className="mb-2 px-2 text-lg font-semibold">Songs</h2>
                  <TrackList tracks={results.songs.slice(0, 4)} album={false} lidarr={lidarr} onPlay={(index) => play([results.songs[index]])} />
                </section>
              )}
            </div>
            {results.albums.length > 0 && <Shelf id="result-albums" title="Albums">{results.albums.map((item) => <CollectionTile key={item.sourceId} item={item} />)}</Shelf>}
            {results.playlists.length > 0 && <Shelf id="result-playlists" title="Playlists">{results.playlists.map((item) => <CollectionTile key={item.sourceId} item={item} />)}</Shelf>}
          </TabsPanel>
          <TabsPanel value="songs" className="pt-4">
            {results.songs.length ? <TrackList tracks={results.songs} header lidarr={lidarr} onPlay={(index) => play([results.songs[index]])} /> : <NoGroup label="songs" />}
          </TabsPanel>
          {(["albums", "playlists"] as const).map((key) => (
            <TabsPanel key={key} value={key} className="pt-4">
              {results[key].length ? <TileGrid>{results[key].map((item) => <CollectionTile key={item.sourceId} item={item} />)}</TileGrid> : <NoGroup label={key} />}
            </TabsPanel>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function NoGroup({ label }: { label: string }) {
  return (
    <Empty className="rounded-xl border border-dashed py-12">
      <EmptyHeader>
        <EmptyTitle>No {label} found</EmptyTitle>
        <EmptyDescription>Try another title, artist, or category.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function TopResult({ item }: { item: SearchItem }) {
  const { play } = useListening();
  const { isFollowing, toggleFollow } = useDownloads();
  const [loading, setLoading] = useState(false);
  const collection = item.kind !== "song" && !item.url;
  const kind = item.kind === "song" ? "Song" : item.kind === "album" ? "Album" : "Playlist";
  const following = isFollowing(item);
  const meta = item.kind === "song" ? formatTime(item.durationSeconds) : item.itemCount ? `${item.itemCount} tracks` : null;

  async function playCollection() {
    setLoading(true);
    try { play(await loadTracks(item.kind, item.sourceId)); }
    catch (cause) { toastManager.add({ type: "error", title: "Could not play this collection", description: cause instanceof Error ? cause.message : undefined }); }
    finally { setLoading(false); }
  }

  return (
    <section aria-labelledby="top-result" className="min-w-0">
      <h2 id="top-result" className="mb-2 px-2 text-lg font-semibold">Top result</h2>
      <div className={`relative flex flex-col gap-4 rounded-xl bg-muted p-5 ${collection ? "hover:bg-accent" : ""}`}>
        <Artwork src={item.thumbnail} className="size-24 rounded-lg" eager />
        <div className="min-w-0">
          {collection ? (
            <Link href={collectionHref(item)} className="line-clamp-2 rounded-sm text-2xl font-bold tracking-tight break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2 focus-visible:ring-ring @3xl:text-3xl">{item.title}</Link>
          ) : (
            <p className="line-clamp-2 text-2xl font-bold tracking-tight break-words @3xl:text-3xl">{item.title}</p>
          )}
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {kind} · <span className="text-foreground">{item.subtitle}</span>
            {meta && <> · <span className="font-mono tabular-nums">{meta}</span></>}
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          {(isPlayable(item) || collection) && (
            <Button size="icon-lg" className="rounded-full before:rounded-full" loading={loading} disabled={loading} aria-label={`Play ${item.title}`} onClick={() => (collection ? void playCollection() : play([item]))}>
              <Play aria-hidden="true" className="fill-current" />
            </Button>
          )}
          <DownloadControl item={item} hidden={false} />
          {collection && (
            <Button variant="ghost" size="icon-sm" aria-pressed={following} aria-label={following ? `Stop following ${item.title}` : `Follow ${item.title}`} title={following ? "Following: new tracks download on their own" : "Follow to download new tracks on their own"} onClick={() => void toggleFollow(item)}>
              {following ? <Bell aria-hidden="true" className="text-brand" /> : <BellOff aria-hidden="true" />}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
