"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellOff, Disc3, Download, ListPlus, Music2, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { useDownloads } from "@/components/downloads-provider";
import { useListening } from "@/components/listening-provider";
import { loadTracks, PageHeader, TrackList } from "@/components/music-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { isActive, isCompleted, totalMinutes, trustedArtwork } from "@/lib/music";
import { PLAYLIST_ID } from "@/lib/source-ids";
import type { SearchItem } from "@/lib/types";

type Kind = "album" | "playlist";

export function CollectionView({ lidarrEnabled }: { lidarrEnabled: boolean }) {
  const params = useSearchParams();
  const kind = params.get("kind");
  const id = params.get("id") ?? "";
  if ((kind !== "album" && kind !== "playlist") || !PLAYLIST_ID.test(id)) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyMedia><Music2 aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
          <EmptyTitle>This link is incomplete</EmptyTitle>
          <EmptyDescription>It does not name an album or playlist. Search for it again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button variant="outline" render={<Link href="/" />}>Back to Home</Button></EmptyContent>
      </Empty>
    );
  }
  const text = (name: string) => (params.get(name) ?? "").trim().slice(0, 300);
  return <Collection key={`${kind}-${id}`} kind={kind} id={id} title={text("title")} subtitle={text("subtitle")} art={trustedArtwork(params.get("art"))} lidarr={lidarrEnabled} />;
}

export function CollectionSkeleton() {
  return (
    <div className="px-5 pt-8 sm:px-7" role="status" aria-label="Loading tracks">
      <div className="flex flex-col gap-5 @2xl:flex-row @2xl:items-end">
        <Skeleton className="size-40 rounded-xl @2xl:size-48" />
        <div className="flex flex-1 flex-col gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
      </div>
      <div className="mt-8 flex flex-col gap-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}</div>
    </div>
  );
}

function Collection({ kind, id, title, subtitle, art, lidarr }: { kind: Kind; id: string; title: string; subtitle: string; art: string | null; lidarr: boolean }) {
  const { play, enqueue } = useListening();
  const { jobFor, download, subscriptions, toggleFollow, requestInLidarr } = useDownloads();
  const [state, setState] = useState<{ tracks: SearchItem[] | null; error: string | null }>({ tracks: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    loadTracks(kind, id)
      // Album track listings omit artwork, so tracks borrow the cover for the player and queue.
      .then((tracks) => { if (active) setState({ tracks: kind === "album" && art ? tracks.map((track) => track.thumbnail ? track : { ...track, thumbnail: art }) : tracks, error: null }); })
      .catch((cause: unknown) => { if (active) setState({ tracks: null, error: cause instanceof Error ? cause.message : "Could not load the track list." }); });
    return () => { active = false; };
  }, [kind, id, art, attempt]);

  const { tracks, error } = state;
  const first = tracks?.[0];
  const name = title || first?.album || (kind === "album" ? "Album" : "Playlist");
  const artist = subtitle || first?.artist || "";
  const item: SearchItem = {
    kind, sourceId: id, title: name, subtitle: artist || name, artist: first?.artist ?? (artist || null), album: kind === "album" ? name : null,
    thumbnail: art ?? first?.thumbnail ?? null, durationSeconds: null, trackNumber: null, itemCount: tracks?.length ?? null,
  };
  const subscription = subscriptions.find((entry) => entry.sourceId === id);
  const job = jobFor(item);

  if (!tracks && !error) return <CollectionSkeleton />;

  return (
    <div className="pb-12">
      <PageHeader
        art={<Artwork src={item.thumbnail} className="size-40 rounded-xl shadow-lg @2xl:size-48" eager />}
        eyebrow={kind === "album" ? "Album" : "Playlist"}
        title={name}
        meta={<>
          {artist && <span className="font-semibold text-foreground">{artist}</span>}
          {tracks && <>{artist && "·"}<span><span className="font-mono tabular-nums">{tracks.length}</span> songs</span>·<span className="font-mono tabular-nums">{totalMinutes(tracks)} min</span></>}
        </>}
      >
        <Button size="icon-xl" className="size-12 rounded-full before:rounded-full sm:size-12" disabled={!tracks?.length} aria-label={`Play ${name}`} onClick={() => tracks && play(tracks)}>
          <Play aria-hidden="true" className="fill-current" />
        </Button>
        <Button variant="ghost" size="icon" disabled={!tracks?.length} aria-label={`Add ${name} to queue`} title="Add to queue" onClick={() => tracks && enqueue(tracks)}><ListPlus aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" aria-pressed={Boolean(subscription)} aria-label={subscription ? `Stop following ${name}` : `Follow ${name}`} title={subscription ? "Following: new tracks download on their own" : "Follow to download new tracks on their own"} onClick={() => void toggleFollow(item)}>
          {subscription ? <Bell aria-hidden="true" className="text-brand" /> : <BellOff aria-hidden="true" />}
        </Button>
        {lidarr && kind === "album" && item.artist && (
          <Button variant="ghost" size="icon" aria-label={`Request ${name} in Lidarr`} title="Request in Lidarr" onClick={() => void requestInLidarr(item)}><Disc3 aria-hidden="true" /></Button>
        )}
        <div className="ms-auto flex items-center gap-2">
          {job && isActive(job) ? (
            <Badge variant="info">{job.status === "running" ? `Downloading · ${job.itemCount ? `${job.itemIndex ?? 0} / ${job.itemCount}` : `${job.progress}%`}` : "Queued for download"}</Badge>
          ) : job && isCompleted(job) ? (
            <Badge variant={job.status === "completed" ? "success" : "warning"}>{job.status === "completed" ? "Downloaded" : `Downloaded · ${job.warningCount} warning${job.warningCount === 1 ? "" : "s"}`}</Badge>
          ) : (
            <Button variant="outline" size="sm" loading={pending} disabled={pending} onClick={async () => { setPending(true); await download(item); setPending(false); }}>
              <Download aria-hidden="true" />{job ? "Download again" : "Download all"}
            </Button>
          )}
        </div>
      </PageHeader>

      <section aria-label="Tracks" className="px-3 sm:px-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border p-4" role="alert">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">The track list did not load</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => { setState({ tracks: null, error: null }); setAttempt((value) => value + 1); }}><RefreshCw aria-hidden="true" />Try again</Button>
            </div>
          </div>
        ) : tracks?.length ? (
          <TrackList tracks={tracks} header album={kind === "playlist"} art={kind === "playlist"} lidarr={lidarr} label={`Tracks of ${name}`} onPlay={(index) => play(tracks.slice(index))} />
        ) : (
          <Empty className="rounded-xl border border-dashed py-12">
            <EmptyHeader>
              <EmptyTitle>No tracks are listed</EmptyTitle>
              <EmptyDescription>YouTube Music returned this {kind} without tracks. Try again later.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {subscription && <p className="mt-6 px-2 text-xs text-muted-foreground">Following. Muzik checks this {kind} every <span className="font-mono tabular-nums">{subscription.intervalHours}h</span> and downloads new tracks.</p>}
      </section>
    </div>
  );
}
