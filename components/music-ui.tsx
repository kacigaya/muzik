"use client";

import Link from "next/link";
import { useState } from "react";
import { AudioLines, Check, Clock, Disc3, Download, Ellipsis, ExternalLink, Heart, ListMusic, ListPlus, Play, Plus, X } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { useDownloads } from "@/components/downloads-provider";
import { useListening } from "@/components/listening-provider";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { formatTime, isActive, isCompleted, navidromeLink } from "@/lib/music";
import type { SearchItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const reveal = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";
const slot = "flex size-8 shrink-0 items-center justify-center sm:size-7";

export function isPlayable(item: SearchItem) {
  return item.kind === "song" && !item.url;
}

export function collectionHref(item: Pick<SearchItem, "kind" | "sourceId" | "title" | "subtitle" | "thumbnail">) {
  const params = new URLSearchParams({ kind: item.kind, id: item.sourceId, title: item.title, subtitle: item.subtitle });
  if (item.thumbnail) params.set("art", item.thumbnail);
  return `/collection?${params}`;
}

export async function loadTracks(kind: string, id: string): Promise<SearchItem[]> {
  const response = await fetch(`/api/tracks?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not load the track list.");
  return data.items as SearchItem[];
}

export function DownloadControl({ item, hidden = true }: { item: SearchItem; hidden?: boolean }) {
  const { jobFor, download, navidromeUrl } = useDownloads();
  const [pending, setPending] = useState(false);
  const job = jobFor(item);
  if (job && isCompleted(job)) {
    const tone = job.status === "completed" ? "text-success-foreground" : "text-warning-foreground";
    const href = navidromeLink(job, navidromeUrl);
    const label = job.status === "completed" ? "Downloaded" : `Downloaded with ${job.warningCount} warning${job.warningCount === 1 ? "" : "s"}`;
    if (!href) return <span role="img" aria-label={`${item.title}: ${label}`} title={label} className={slot}><Check aria-hidden="true" className={cn("size-4", tone)} /></span>;
    return <Button variant="ghost" size="icon-sm" render={<a href={href} target="_blank" rel="noreferrer" />} aria-label={`${item.title}: ${label}. Open in Navidrome`} title={`${label}. Open in Navidrome`}><Check aria-hidden="true" className={tone} /></Button>;
  }
  if (job && isActive(job)) {
    const running = job.status === "running";
    const label = running ? `Downloading, ${job.progress}%` : job.status === "retrying" ? "Retrying download" : "Queued for download";
    return (
      <span role="img" aria-label={`${item.title}: ${label}`} title={label} className={slot}>
        {running ? <Spinner aria-hidden="true" role="presentation" className="size-4 text-brand" /> : <Clock aria-hidden="true" className="size-4 text-muted-foreground" />}
      </span>
    );
  }
  return (
    <Button variant="ghost" size="icon-sm" className={hidden && !job ? reveal : undefined} loading={pending} disabled={pending} aria-label={job ? `Download ${item.title} again` : `Download ${item.title}`} title={job ? "Last download failed. Download again" : "Download"} onClick={async () => { setPending(true); await download(item); setPending(false); }}>
      <Download aria-hidden="true" />
    </Button>
  );
}

function LikeControl({ track }: { track: SearchItem }) {
  const { library, loading, mutate } = useListening();
  const liked = library.likes.some((item) => item.sourceId === track.sourceId);
  return (
    <Button variant="ghost" size="icon-sm" className={liked ? undefined : reveal} disabled={loading} aria-pressed={liked} aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`} onClick={() => void mutate(liked ? { action: "unlike", sourceId: track.sourceId } : { action: "like", track })}>
      <Heart aria-hidden="true" className={liked ? "fill-current text-brand" : undefined} />
    </Button>
  );
}

function TrackMenu({ track, lidarr, onRemove }: { track: SearchItem; lidarr: boolean; onRemove?: () => void }) {
  const { library, loading, mutate, enqueue } = useListening();
  const { jobFor, navidromeUrl, requestInLidarr } = useDownloads();
  const playable = isPlayable(track);
  const liked = library.likes.some((item) => item.sourceId === track.sourceId);
  const job = jobFor(track);
  const navidrome = job && isCompleted(job) ? navidromeLink(job, navidromeUrl) : null;
  const canRequest = lidarr && Boolean(track.artist && track.album);
  if (!playable && !canRequest && !navidrome && !onRemove) return <span aria-hidden="true" className={slot} />;
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon-sm" className={reveal} aria-label={`More actions for ${track.title}`} />}>
        <Ellipsis aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end">
        {playable && <MenuItem disabled={loading} onClick={() => void mutate(liked ? { action: "unlike", sourceId: track.sourceId } : { action: "like", track })}><Heart aria-hidden="true" className={liked ? "fill-current" : undefined} />{liked ? "Unlike" : "Like"}</MenuItem>}
        {playable && <MenuItem onClick={() => { enqueue([track]); toastManager.add({ type: "success", title: "Added to queue", description: track.title }); }}><ListPlus aria-hidden="true" />Add to queue</MenuItem>}
        {playable && (library.playlists.length ? (
          <MenuSub>
            <MenuSubTrigger><ListMusic aria-hidden="true" />Add to playlist</MenuSubTrigger>
            <MenuSubPopup>
              {library.playlists.map((playlist) => (
                <MenuItem key={playlist.id} onClick={() => void mutate({ action: "add", id: playlist.id, tracks: [track] }).then((saved) => { if (saved) toastManager.add({ type: "success", title: `Added to ${playlist.name}`, description: track.title }); })}>
                  <span className="truncate">{playlist.name}</span>
                </MenuItem>
              ))}
            </MenuSubPopup>
          </MenuSub>
        ) : (
          <MenuLinkItem render={<Link href="/saved?new=1" />}><Plus aria-hidden="true" />Create a playlist</MenuLinkItem>
        ))}
        {canRequest && <MenuItem onClick={() => void requestInLidarr(track)}><Disc3 aria-hidden="true" />Request {track.kind === "song" ? "album" : "it"} in Lidarr</MenuItem>}
        {navidrome && <MenuLinkItem href={navidrome} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open in Navidrome</MenuLinkItem>}
        {onRemove && <><MenuSeparator /><MenuItem variant="destructive" onClick={onRemove}><X aria-hidden="true" />Remove from playlist</MenuItem></>}
      </MenuPopup>
    </Menu>
  );
}

const COLUMNS = {
  album: "grid-cols-[1.75rem_minmax(0,1fr)_auto] @2xl:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,0.7fr)_auto]",
  plain: "grid-cols-[1.75rem_minmax(0,1fr)_auto]",
};

type TrackListProps = {
  tracks: SearchItem[];
  onPlay: (index: number) => void;
  album?: boolean;
  art?: boolean;
  header?: boolean;
  lidarr?: boolean;
  onRemove?: (track: SearchItem) => void;
  label?: string;
};

export function TrackList({ tracks, onPlay, album = true, art = true, header = false, lidarr = false, onRemove, label }: TrackListProps) {
  const { current } = useListening();
  return (
    <div>
      {header && (
        <div aria-hidden="true" className={cn("grid items-center gap-3 border-b px-2 pb-2 text-xs font-medium text-muted-foreground", album ? COLUMNS.album : COLUMNS.plain)}>
          <span className="text-end font-mono">#</span>
          <span>Title</span>
          {album && <span className="hidden @2xl:block">Album</span>}
        </div>
      )}
      <ol aria-label={label} className={cn("flex flex-col", header && "mt-2")}>
        {tracks.map((track, index) => {
          const playable = isPlayable(track);
          const playing = playable && current?.sourceId === track.sourceId;
          return (
            <li key={`${track.kind}-${track.sourceId}-${index}`} aria-current={playing ? "true" : undefined} className={cn("group grid items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent", album ? COLUMNS.album : COLUMNS.plain, playing && "bg-accent")}>
              <span className="relative flex h-8 items-center justify-end">
                <span className={cn(playable && "group-hover:opacity-0 group-focus-within:opacity-0 pointer-coarse:opacity-0")}>
                  {playing ? <AudioLines aria-hidden="true" className="size-4 text-brand" /> : <span className="font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>}
                </span>
                {playable && (
                  <Button variant="ghost" size="icon-sm" className={cn("absolute inset-y-0 end-0 my-auto", reveal)} aria-label={`Play ${track.title}`} onClick={() => onPlay(index)}>
                    <Play aria-hidden="true" className="fill-current" />
                  </Button>
                )}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                {art && <Artwork src={track.thumbnail} className="size-10" />}
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium", playing && "text-brand")}>{track.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{album && track.artist ? track.artist : track.subtitle}</span>
                </span>
              </span>
              {album && <span className="hidden truncate text-sm text-muted-foreground @2xl:block">{track.album}</span>}
              <span className="flex items-center justify-end gap-0.5">
                <span className="contents max-sm:hidden">
                  {playable ? <LikeControl track={track} /> : <span aria-hidden="true" className={slot} />}
                  <span className="w-10 text-end font-mono text-xs text-muted-foreground tabular-nums">{formatTime(track.durationSeconds)}</span>
                </span>
                <DownloadControl item={track} />
                <TrackMenu track={track} lidarr={lidarr} onRemove={onRemove && (() => onRemove(track))} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CollectionTile({ item }: { item: SearchItem }) {
  const meta = [item.kind === "album" ? "Album" : "Playlist", item.subtitle, item.itemCount ? `${item.itemCount} tracks` : null].filter(Boolean).join(" · ");
  if (item.url) {
    return (
      <li className="rounded-xl p-2">
        <Artwork src={item.thumbnail} className="aspect-square w-full rounded-lg" />
        <div className="mt-2 flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">{meta}</p>
          </div>
          <DownloadControl item={item} hidden={false} />
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link href={collectionHref(item)} className="block rounded-xl p-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <Artwork src={item.thumbnail} className="aspect-square w-full rounded-lg" />
        <span className="mt-2 block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </Link>
    </li>
  );
}

export function SectionHeading({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1 flex min-h-8 items-end justify-between gap-4 px-2">
      <h2 id={id} className="text-lg font-semibold text-balance">{title}</h2>
      {children}
    </div>
  );
}

export function Shelf({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <SectionHeading id={id} title={title}>{action}</SectionHeading>
      <ul className="-mx-2 grid auto-cols-[9.5rem] grid-flow-col overflow-x-auto px-2 pb-2 [scrollbar-width:thin] @3xl:auto-cols-[11rem]">{children}</ul>
    </section>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <ul className="-mx-2 grid grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">{children}</ul>;
}

export function PageHeader({ art, eyebrow, title, meta, children }: { art: React.ReactNode; eyebrow: string; title: string; meta: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="px-5 pt-8 pb-4 sm:px-7">
      <div className="flex flex-col gap-5 @2xl:flex-row @2xl:items-end">
        {art}
        <div className="min-w-0">
          <p className="text-xs font-medium">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-balance break-words @3xl:text-5xl">{title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">{meta}</div>
        </div>
      </div>
      {children && <div className="mt-6 flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
