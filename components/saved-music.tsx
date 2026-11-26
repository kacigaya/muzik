"use client";

import Link from "next/link";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, ListMusic, ListPlus, Pencil, Play, Plus } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { useListening } from "@/components/listening-provider";
import { PageHeader, TrackList } from "@/components/music-ui";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { totalMinutes } from "@/lib/music";
import { cn } from "@/lib/utils";

export function SavedSkeleton() {
  return (
    <div className="px-5 pt-8 sm:px-7" role="status" aria-label="Loading saved music">
      <div className="flex gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-8 w-24 rounded-full" />)}</div>
      <div className="mt-8 flex flex-col gap-5 @2xl:flex-row @2xl:items-end">
        <Skeleton className="size-40 rounded-xl @2xl:size-48" />
        <div className="flex flex-1 flex-col gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-10 w-1/2" /></div>
      </div>
    </div>
  );
}

export function SavedMusic() {
  const params = useSearchParams();
  const router = useRouter();
  const { library, loading, error, mutate, play, enqueue } = useListening();
  const selected = params.get("playlist");
  const [creatingHere, setCreating] = useState(false);
  const linkedCreate = params.get("new") === "1";
  const creating = creatingHere || linkedCreate;
  const closeCreate = () => {
    setCreating(false);
    if (linkedCreate) router.replace(selected ? `/saved?playlist=${selected}` : "/saved");
  };
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading) return <SavedSkeleton />;

  const playlist = selected ? library.playlists.find((item) => item.id === selected) : undefined;
  const tracks = playlist ? playlist.tracks : library.likes;
  const pill = "rounded-full before:rounded-full";

  return (
    <div className="pb-12">
      <nav aria-label="Saved collections" className="flex gap-1.5 overflow-x-auto px-5 pt-5 [scrollbar-width:none] sm:px-7">
        <Button size="sm" variant={!selected ? "default" : "secondary"} className={pill} render={<Link href="/saved" />} aria-current={!selected ? "page" : undefined}>Liked songs</Button>
        {library.playlists.map((item) => (
          <Button key={item.id} size="sm" variant={item.id === selected ? "default" : "secondary"} className={cn(pill, "max-w-48")} render={<Link href={`/saved?playlist=${item.id}`} />} aria-current={item.id === selected ? "page" : undefined}>
            <span className="truncate">{item.name}</span>
          </Button>
        ))}
        <Button size="sm" variant="outline" className={pill} aria-expanded={creating} aria-controls="new-playlist" onClick={() => (creating ? closeCreate() : setCreating(true))}><Plus aria-hidden="true" />New playlist</Button>
      </nav>

      {creating && (
        <form id="new-playlist" className="mx-5 mt-3 flex flex-wrap items-end gap-2 rounded-xl border p-3 sm:mx-7" onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            if (await mutate({ action: "create", name })) { setName(""); closeCreate(); }
          } finally { setSaving(false); }
        }}>
          <label className="min-w-40 flex-1 text-xs font-medium">
            Playlist name
            <Input className="mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="Road trip" autoFocus />
          </label>
          <Button type="submit" loading={saving} disabled={!name.trim()}>Create playlist</Button>
          <Button type="button" variant="ghost" onClick={closeCreate}>Cancel</Button>
        </form>
      )}

      {selected && !playlist ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia><ListMusic aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>This playlist no longer exists</EmptyTitle>
            <EmptyDescription>Someone on this server deleted it, or the link is wrong.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" render={<Link href="/saved" />}>Open liked songs</Button></EmptyContent>
        </Empty>
      ) : (
        <>
          <PageHeader
            art={playlist
              ? <Artwork src={playlist.tracks[0]?.thumbnail} icon={ListMusic} className="size-40 rounded-xl shadow-lg @2xl:size-48" eager />
              : <span className="flex size-40 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg @2xl:size-48"><Heart aria-hidden="true" className="size-14 fill-current" /></span>}
            eyebrow={playlist ? "Playlist" : "Saved music"}
            title={playlist?.name ?? "Liked songs"}
            meta={<><span><span className="font-mono tabular-nums">{tracks.length}</span> songs</span>·<span className="font-mono tabular-nums">{totalMinutes(tracks)} min</span>·<span>Shared by everyone on this server</span></>}
          >
            <Button size="icon-xl" className="size-12 rounded-full before:rounded-full sm:size-12" disabled={!tracks.length} aria-label={`Play ${playlist?.name ?? "liked songs"}`} onClick={() => play(tracks)}>
              <Play aria-hidden="true" className="fill-current" />
            </Button>
            <Button variant="ghost" size="icon" disabled={!tracks.length} aria-label="Add all to queue" title="Add all to queue" onClick={() => enqueue(tracks)}><ListPlus aria-hidden="true" /></Button>
            {playlist && (
              <>
                <Button variant="ghost" size="sm" aria-expanded={renaming} aria-controls="rename-playlist" onClick={() => setRenaming((value) => !value)}><Pencil aria-hidden="true" />Rename</Button>
                <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                  <AlertDialog.Trigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
                    <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-sm">
                      <AlertDialog.Title className="font-semibold">Delete {playlist.name}?</AlertDialog.Title>
                      <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">This removes the playlist for everyone on this server. Downloaded audio files stay on disk.</AlertDialog.Description>
                      {error && <p className="mt-2 text-xs text-destructive-foreground" role="alert">{error}</p>}
                      <div className="mt-5 flex justify-end gap-2">
                        <AlertDialog.Close render={<Button variant="outline" disabled={deleting} />}>Cancel</AlertDialog.Close>
                        <Button variant="destructive" loading={deleting} onClick={async () => {
                          setDeleting(true);
                          try {
                            if (await mutate({ action: "delete", id: playlist.id })) { setConfirmDelete(false); router.push("/saved"); }
                          } finally { setDeleting(false); }
                        }}>Delete playlist</Button>
                      </div>
                    </AlertDialog.Popup>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              </>
            )}
          </PageHeader>

          {playlist && renaming && (
            <form id="rename-playlist" key={`${playlist.id}-${playlist.name}`} className="mx-5 mb-4 flex flex-wrap items-end gap-2 rounded-xl border p-3 sm:mx-7" onSubmit={async (event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get("name") ?? "");
              if (await mutate({ action: "rename", id: playlist.id, name: value })) setRenaming(false);
            }}>
              <label className="min-w-40 flex-1 text-xs font-medium">Playlist name<Input className="mt-1 w-full" name="name" defaultValue={playlist.name} maxLength={100} required autoFocus /></label>
              <Button size="sm" type="submit">Save name</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            </form>
          )}

          <section aria-label="Tracks" className="px-3 sm:px-5">
            {tracks.length ? (
              <TrackList
                tracks={tracks}
                header
                label={playlist?.name ?? "Liked songs"}
                onPlay={(index) => play(tracks.slice(index))}
                onRemove={playlist && ((track) => void mutate({ action: "remove", id: playlist.id, sourceId: track.sourceId }))}
              />
            ) : (
              <Empty className="rounded-xl border border-dashed py-12">
                <EmptyHeader>
                  <EmptyMedia>{playlist ? <ListMusic aria-hidden="true" className="size-7 text-muted-foreground" /> : <Heart aria-hidden="true" className="size-7 text-muted-foreground" />}</EmptyMedia>
                  <EmptyTitle>{playlist ? "This playlist is empty" : "No liked songs yet"}</EmptyTitle>
                  <EmptyDescription>{playlist ? "Open the menu on any song and choose Add to playlist." : "Press the heart on any song or in the player."}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent><Button variant="outline" render={<Link href="/" />}>Find music</Button></EmptyContent>
              </Empty>
            )}
          </section>
        </>
      )}
    </div>
  );
}
