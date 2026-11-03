"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Heart, ListMusic, ListPlus, Play, SkipBack, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listeningTrack, MAX_QUEUE, restoreQueue, updateQueue, type ListeningCommand, type ListeningLibrary, type PlaybackQueue, type QueueAction } from "@/lib/listening";
import type { SearchItem } from "@/lib/types";

const EMPTY: ListeningLibrary = { likes: [], playlists: [] };
type ListeningContext = {
  library: ListeningLibrary;
  loading: boolean;
  error: string | null;
  mutate: (command: ListeningCommand) => Promise<boolean>;
  play: (tracks: SearchItem[]) => void;
  enqueue: (tracks: SearchItem[]) => void;
};
const Context = createContext<ListeningContext | null>(null);
export function useListening() {
  const context = useContext(Context);
  if (!context) throw new Error("ListeningProvider is required.");
  return context;
}

export function ListeningProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<ListeningLibrary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<PlaybackQueue>({ tracks: [], index: 0 });
  const [restored, setRestored] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [revision, setRevision] = useState(0);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void fetch("/api/listening", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load saved music.");
      if (active) setLibrary(data as ListeningLibrary);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load saved music.");
    }).finally(() => { if (active) setLoading(false); });
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem("muzik-playback");
        if (raw) setQueue(restoreQueue(JSON.parse(raw)));
      } catch { /* A corrupt or unavailable browser store must not block playback. */ }
      setRestored(true);
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem("muzik-playback", JSON.stringify(queue)); } catch { /* Playback works without browser storage. */ }
  }, [queue, restored]);

  const mutate = useCallback((command: ListeningCommand): Promise<boolean> => {
    const run = writes.current.then(async () => {
      setError(null);
      try {
        const response = await fetch("/api/listening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not save music.");
        setLibrary(data as ListeningLibrary);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save music.");
        return false;
      }
    });
    writes.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const play = useCallback((tracks: SearchItem[]) => {
    try {
      const valid = tracks.map(listeningTrack);
      if (!valid.length) throw new Error("No playable tracks in this collection.");
      if (valid.length > MAX_QUEUE) throw new Error(`Play up to ${MAX_QUEUE} tracks at a time.`);
      setError(null);
      setQueue(updateQueue({ tracks: [], index: 0 }, { type: "play", tracks: valid }));
      setAutoplay(true);
      setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not play music."); }
  }, []);

  const enqueue = useCallback((tracks: SearchItem[]) => {
    try {
      const valid = tracks.map(listeningTrack);
      // The updater owns the capacity check because several adds may happen in one render.
      setQueue((current) => updateQueue(current, { type: "enqueue", tracks: valid }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not queue music."); }
  }, []);

  return (
    <Context value={{ library, loading, error, mutate, play, enqueue }}>
      <div className={queue.tracks.length ? "pb-[calc(16rem+env(safe-area-inset-bottom))] sm:pb-40" : undefined}>
        {children}
      </div>
      {error && <div className="mx-auto max-w-6xl px-4 pb-4 text-sm text-destructive-foreground" role="alert">{error}</div>}
      {restored && queue.tracks.length > 0 && <PlaybackBar queue={queue} autoplay={autoplay} revision={revision} onAction={(action) => {
        setQueue((current) => updateQueue(current, action));
        if (action.type === "select" || (action.type === "remove" && action.index === queue.index)) { setAutoplay(true); setRevision((value) => value + 1); }
      }} />}
    </Context>
  );
}

function PlaybackBar({ queue, autoplay, revision, onAction }: { queue: PlaybackQueue; autoplay: boolean; revision: number; onAction: (action: QueueAction) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const volume = useRef({ level: 1, muted: false });
  const [error, setError] = useState<string | null>(null);
  const { library, loading, mutate } = useListening();
  const track = queue.tracks[queue.index];
  const liked = library.likes.some((item) => item.sourceId === track.sourceId);

  const previous = useCallback(() => {
    if (audio.current && audio.current.currentTime > 3) audio.current.currentTime = 0;
    else if (queue.index > 0) onAction({ type: "select", index: queue.index - 1 });
  }, [queue.index, onAction]);
  const next = useCallback(() => {
    if (queue.index < queue.tracks.length - 1) onAction({ type: "select", index: queue.index + 1 });
  }, [queue.index, queue.tracks.length, onAction]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist ?? "", album: track.album ?? "", artwork: track.thumbnail ? [{ src: track.thumbnail }] : [] });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { void audio.current?.play().catch(() => setError("Press Play to start audio.")); },
      pause: () => audio.current?.pause(),
      previoustrack: previous,
      nexttrack: next,
      seekto: (details) => { if (audio.current && details.seekTime != null) audio.current.currentTime = details.seekTime; },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); } catch { /* Some browsers support only a subset of media controls. */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null); } catch { /* Unsupported media action. */ }
      }
      navigator.mediaSession.metadata = null;
    };
  }, [track, previous, next]);

  return (
    <footer aria-label="Music player" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm">
      <div className="mx-auto max-w-6xl">
        <details className="group mb-2">
          <summary className="w-fit cursor-pointer rounded text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">Playback queue · {queue.index + 1} of {queue.tracks.length}</summary>
          <div className="max-h-[40dvh] overflow-y-auto py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Up to {MAX_QUEUE} tracks. New tracks beyond this limit are not added.</span>
              <Button variant="ghost" size="sm" onClick={() => onAction({ type: "clear" })}>Clear queue</Button>
            </div>
            <ol className="space-y-1">
              {queue.tracks.map((item, index) => (
                <li key={`${item.sourceId}-${index}`} className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent">
                  <Button className="min-w-0 flex-1 justify-start overflow-hidden" variant={index === queue.index ? "secondary" : "ghost"} size="sm" onClick={() => onAction({ type: "select", index })} aria-current={index === queue.index ? "true" : undefined}>
                    <span className="truncate">{index + 1}. {item.title}</span>
                  </Button>
                  <Button size="icon-sm" variant="ghost" disabled={index === 0} aria-label={`Move ${item.title} up`} onClick={() => onAction({ type: "move", index, direction: -1 })}><ArrowUp aria-hidden="true" /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={index === queue.tracks.length - 1} aria-label={`Move ${item.title} down`} onClick={() => onAction({ type: "move", index, direction: 1 })}><ArrowDown aria-hidden="true" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.title} from queue`} onClick={() => onAction({ type: "remove", index })}><X aria-hidden="true" /></Button>
                </li>
              ))}
            </ol>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1 sm:w-52 sm:flex-none" aria-live="polite">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist ?? track.subtitle}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous track" onClick={previous}><SkipBack aria-hidden="true" /></Button>
            <Button size="icon" variant="ghost" disabled={queue.index === queue.tracks.length - 1} aria-label="Next track" onClick={next}><SkipForward aria-hidden="true" /></Button>
            <Button size="icon" variant="ghost" disabled={loading} aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`} aria-pressed={liked} onClick={() => void mutate(liked ? { action: "unlike", sourceId: track.sourceId } : { action: "like", track })}><Heart aria-hidden="true" className={liked ? "fill-current text-brand" : undefined} /></Button>
            <Button variant="ghost" size="icon" aria-label="Close player and clear queue" onClick={() => onAction({ type: "clear" })}><X aria-hidden="true" /></Button>
          </div>
          <audio
            key={`${track.sourceId}-${revision}`}
            ref={audio}
            className="h-10 w-full min-w-0 sm:flex-1"
            aria-label={`Play ${track.title}`}
            controls
            autoPlay={autoplay}
            preload="none"
            src={`/api/audio?id=${encodeURIComponent(track.sourceId)}`}
            onLoadStart={() => setError(null)}
            onLoadedMetadata={(event) => {
              event.currentTarget.volume = volume.current.level;
              event.currentTarget.muted = volume.current.muted;
            }}
            onVolumeChange={(event) => { volume.current = { level: event.currentTarget.volume, muted: event.currentTarget.muted }; }}
            onEnded={() => { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; next(); }}
            onPlaying={() => { setError(null); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; }}
            onPause={() => { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; }}
            onError={() => setError("Could not stream this track. YouTube may block this server or the track may be unavailable.")}
          />
        </div>
        {error && <div className="mt-2 flex items-center gap-2 text-xs text-destructive-foreground" role="alert"><span>{error}</span><Button variant="outline" size="xs" onClick={() => { setError(null); onAction({ type: "select", index: queue.index }); }}>Retry</Button></div>}
      </div>
    </footer>
  );
}

export function TrackActions({ track }: { track: SearchItem }) {
  const { library, loading, play, enqueue, mutate } = useListening();
  const [playlistId, setPlaylistId] = useState("");
  const liked = library.likes.some((item) => item.sourceId === track.sourceId);
  if (track.kind !== "song" || track.url) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" onClick={() => play([track])}><Play aria-hidden="true" />Play</Button>
      <Button size="icon" variant="ghost" aria-label={`Add ${track.title} to playback queue`} onClick={() => enqueue([track])}><ListPlus aria-hidden="true" /></Button>
      <Button size="icon" variant="ghost" disabled={loading} aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`} aria-pressed={liked} onClick={() => void mutate(liked ? { action: "unlike", sourceId: track.sourceId } : { action: "like", track })}><Heart aria-hidden="true" className={liked ? "fill-current text-brand" : undefined} /></Button>
      {library.playlists.length > 0 ? <label className="min-w-0 max-w-40 text-xs">
        <span className="sr-only">Add {track.title} to a playlist</span>
        <select className="h-9 w-full rounded-md border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={playlistId} onChange={(event) => {
          const id = event.target.value;
          setPlaylistId(id);
          if (id) void mutate({ action: "add", id, tracks: [track] }).then((saved) => { if (saved) setPlaylistId(""); });
        }}>
          <option value="">Add to playlist…</option>
          {library.playlists.map((playlist) => <option value={playlist.id} key={playlist.id}>{playlist.name}</option>)}
        </select>
      </label> : <Button size="icon" variant="ghost" render={<Link href="/saved" />} aria-label="Create a playlist"><ListMusic aria-hidden="true" /></Button>}
    </div>
  );
}
