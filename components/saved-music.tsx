"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState } from "react";
import { Download, Heart, Play, Plus, X } from "lucide-react";
import { TrackActions, useListening } from "@/components/listening-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AUDIO_FORMATS, type AudioFormat, type SearchItem } from "@/lib/types";

export function SavedMusic() {
  const { library, loading, error, mutate, play, enqueue } = useListening();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("likes");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const playlist = library.playlists.find((item) => item.id === selected);
  const tracks = playlist ? playlist.tracks : library.likes;

  async function download(track: SearchItem) {
    setDownloadError(null);
    try {
      let format: AudioFormat | undefined;
      try {
        const stored = localStorage.getItem("muzik-format") as AudioFormat | null;
        if (stored && AUDIO_FORMATS.includes(stored)) format = stored;
      } catch { /* Without browser storage the server's default format applies. */ }
      const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...track, ...(format && { format }) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start download.");
    } catch (cause) { setDownloadError(cause instanceof Error ? cause.message : "Could not start download."); }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <h1 className="font-heading text-2xl font-semibold text-balance">Saved music</h1>
      <p className="mt-2 text-sm text-muted-foreground">Liked songs and playlists are shared on this Muzik server.</p>
      <form className="my-6 flex flex-wrap items-end gap-2" onSubmit={async (event) => {
        event.preventDefault(); setSaving(true);
        try { if (await mutate({ action: "create", name })) setName(""); } finally { setSaving(false); }
      }}>
        <label className="min-w-40 flex-1 text-xs font-medium">
          Playlist name
          <Input className="mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required placeholder="New playlist" />
        </label>
        <Button type="submit" loading={saving} disabled={loading || !name.trim()}><Plus aria-hidden="true" />Create playlist</Button>
      </form>
      {(error || downloadError) && <p className="mb-4 text-sm text-destructive-foreground" role="alert">{error ?? downloadError}</p>}
      {loading ? <Skeleton className="h-40 w-full" /> : <>
        <label className="mb-5 block text-xs font-medium">
          Collection
          <select value={playlist?.id ?? "likes"} onChange={(event) => setSelected(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="likes">Liked songs ({library.likes.length})</option>
            {library.playlists.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.tracks.length})</option>)}
          </select>
        </label>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold"><Heart aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{playlist?.name ?? "Liked songs"}</span></h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!tracks.length} onClick={() => play(tracks)}><Play aria-hidden="true" />Play all</Button>
            <Button size="sm" variant="outline" disabled={!tracks.length} onClick={() => enqueue(tracks)}>Add to queue</Button>
          </div>
        </div>
        {playlist && <form className="mb-4 flex flex-wrap items-end gap-2" key={`${playlist.id}-${playlist.name}`} onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutate({ action: "rename", id: playlist.id, name: String(form.get("name") ?? "") });
        }}>
          <label className="w-full min-w-40 flex-1 text-xs">Rename playlist<Input className="mt-1 w-full" name="name" defaultValue={playlist.name} maxLength={100} required /></label>
          <Button size="sm" variant="outline" type="submit">Rename</Button>
          <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialog.Trigger render={<Button size="sm" variant="ghost" />}>Delete playlist</AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
              <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-sm">
                <AlertDialog.Title className="font-semibold">Delete {playlist.name}?</AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">This removes the playlist. Saved audio files stay on disk.</AlertDialog.Description>
                {error && <p className="mt-2 text-xs text-destructive-foreground" role="alert">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialog.Close render={<Button variant="outline" disabled={deleting} />}>Cancel</AlertDialog.Close>
                  <Button variant="destructive" loading={deleting} onClick={async () => {
                    setDeleting(true);
                    try { if (await mutate({ action: "delete", id: playlist.id })) { setSelected("likes"); setConfirmDelete(false); } }
                    finally { setDeleting(false); }
                  }}>Delete playlist</Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </form>}
        {tracks.length ? <ul className="space-y-2">
          {tracks.map((track) => <li key={track.sourceId}>
            <Card className="gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{track.title}</p><p className="truncate text-xs text-muted-foreground">{track.subtitle}</p></div>
                <Button size="icon" variant="ghost" aria-label={`Download ${track.title}`} onClick={() => void download(track)}><Download aria-hidden="true" /></Button>
                {playlist && <Button size="icon" variant="ghost" aria-label={`Remove ${track.title} from ${playlist.name}`} onClick={() => void mutate({ action: "remove", id: playlist.id, sourceId: track.sourceId })}><X aria-hidden="true" /></Button>}
              </div>
              <TrackActions track={track} />
            </Card>
          </li>)}
        </ul> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{playlist ? "Add songs from search with the playlist control on each song." : "Like songs from search or the player to save them here."}</div>}
      </>}
    </div>
  );
}
