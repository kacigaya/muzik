"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp, AudioLines, Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { listeningTrack, MAX_QUEUE, restoreQueue, updateQueue, type ListeningCommand, type ListeningLibrary, type PlaybackQueue, type QueueAction } from "@/lib/listening";
import { formatTime } from "@/lib/music";
import type { SearchItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: ListeningLibrary = { likes: [], playlists: [] };
type ListeningContext = {
  library: ListeningLibrary;
  loading: boolean;
  error: string | null;
  mutate: (command: ListeningCommand) => Promise<boolean>;
  play: (tracks: SearchItem[]) => void;
  enqueue: (tracks: SearchItem[]) => void;
  queue: PlaybackQueue;
  current: SearchItem | null;
  dispatch: (action: QueueAction) => void;
  paused: boolean;
  toggle: () => void;
};
type PlayerContext = {
  audio: RefObject<HTMLAudioElement | null>;
  seek: (seconds: number) => void;
  position: () => number;
  applyVolume: (volume: number, muted: boolean) => void;
  resume: () => void;
  pause: () => void;
  autoplay: boolean;
  revision: number;
  restored: boolean;
  playbackKey: string;
  setPaused: (paused: boolean) => void;
  streamError: string | null;
  setStreamError: (error: string | null) => void;
};
const Context = createContext<ListeningContext | null>(null);
const Player = createContext<PlayerContext | null>(null);

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
  const [playback, setPlayback] = useState({ key: "", paused: true });
  const [streamError, setStreamError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const audio = useRef<HTMLAudioElement>(null);
  const current = queue.tracks[queue.index] ?? null;
  // A new audio element starts paused, so state from the previous track never leaks into the next one.
  const playbackKey = current ? `${current.sourceId}-${revision}` : "";
  const paused = playback.key !== playbackKey || playback.paused;

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

  const restart = useCallback(() => {
    setAutoplay(true);
    setStreamError(null);
    setRevision((value) => value + 1);
  }, []);

  const play = useCallback((tracks: SearchItem[]) => {
    try {
      const valid = tracks.map(listeningTrack);
      if (!valid.length) throw new Error("No playable tracks in this collection.");
      if (valid.length > MAX_QUEUE) throw new Error(`Play up to ${MAX_QUEUE} tracks at a time.`);
      setError(null);
      setQueue(updateQueue({ tracks: [], index: 0 }, { type: "play", tracks: valid }));
      restart();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not play music."); }
  }, [restart]);

  const enqueue = useCallback((tracks: SearchItem[]) => {
    try {
      const valid = tracks.map(listeningTrack);
      // The updater owns the capacity check because several adds may happen in one render.
      setQueue((value) => updateQueue(value, { type: "enqueue", tracks: valid }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not queue music."); }
  }, []);

  const dispatch = useCallback((action: QueueAction) => {
    setQueue((value) => updateQueue(value, action));
    if (action.type === "select" || (action.type === "remove" && action.index === queue.index)) restart();
  }, [queue.index, restart]);

  const resume = useCallback(() => { void audio.current?.play().catch(() => setStreamError("Press Play to start audio.")); }, []);
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback(() => { if (audio.current?.paused) resume(); else pause(); }, [resume, pause]);
  const seek = useCallback((seconds: number) => { if (audio.current) audio.current.currentTime = seconds; }, []);
  const position = useCallback(() => audio.current?.currentTime ?? 0, []);
  const applyVolume = useCallback((volume: number, muted: boolean) => {
    if (!audio.current) return;
    audio.current.volume = volume;
    audio.current.muted = muted;
  }, []);

  const setPaused = useCallback((value: boolean) => setPlayback({ key: playbackKey, paused: value }), [playbackKey]);

  return (
    <Context value={{ library, loading, error, mutate, play, enqueue, queue, current, dispatch, paused, toggle }}>
      <Player value={{ audio, seek, position, applyVolume, resume, pause, autoplay, revision, restored, playbackKey, setPaused, streamError, setStreamError }}>
        {children}
      </Player>
    </Context>
  );
}

function LikeButton({ track, className }: { track: SearchItem; className?: string }) {
  const { library, loading, mutate } = useListening();
  const liked = library.likes.some((item) => item.sourceId === track.sourceId);
  return (
    <Button size="icon-sm" variant="ghost" className={className} disabled={loading} aria-pressed={liked} aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`} onClick={() => void mutate(liked ? { action: "unlike", sourceId: track.sourceId } : { action: "like", track })}>
      <Heart aria-hidden="true" className={liked ? "fill-current text-brand" : undefined} />
    </Button>
  );
}

export function PlayerBar() {
  const { queue, current, paused, toggle, dispatch } = useListening();
  const player = useContext(Player);
  if (!player) throw new Error("ListeningProvider is required.");
  const { audio, seek: seekAudio, position: audioPosition, applyVolume, resume, pause, autoplay, revision, restored, playbackKey, setPaused, streamError, setStreamError } = player;
  const [position, setPosition] = useState({ key: "", time: 0, length: null as number | null });
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const time = position.key === playbackKey ? position.time : 0;
  const length = (position.key === playbackKey ? position.length : null) ?? current?.durationSeconds ?? null;

  const previous = useCallback(() => {
    if (audioPosition() > 3) seekAudio(0);
    else if (queue.index > 0) dispatch({ type: "select", index: queue.index - 1 });
  }, [audioPosition, seekAudio, queue.index, dispatch]);
  const next = useCallback(() => {
    if (queue.index < queue.tracks.length - 1) dispatch({ type: "select", index: queue.index + 1 });
  }, [queue.index, queue.tracks.length, dispatch]);

  useEffect(() => applyVolume(volume, muted), [applyVolume, volume, muted, playbackKey]);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist ?? "", album: current.album ?? "", artwork: current.thumbnail ? [{ src: current.thumbnail }] : [] });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: resume,
      pause,
      previoustrack: previous,
      nexttrack: next,
      seekto: (details) => { if (details.seekTime != null) seekAudio(details.seekTime); },
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
  }, [current, previous, next, resume, pause, seekAudio]);

  if (!restored || !current) return null;

  const seekMax = Math.max(1, Math.floor(length ?? 0));
  const seek = (value: string) => {
    const target = Number(value);
    seekAudio(target);
    setPosition({ key: playbackKey, time: target, length });
  };
  const seekLabel = `${formatTime(time)} of ${formatTime(length) ?? "unknown length"}`;
  const playLabel = paused ? `Play ${current.title}` : `Pause ${current.title}`;
  const PlayIcon = paused ? Play : Pause;

  return (
    <footer aria-label="Music player" className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl border bg-card p-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)] lg:gap-6 lg:px-3">
      <div className="flex min-w-0 items-center gap-3" aria-live="polite">
        <Artwork src={current.thumbnail} className="size-11 lg:size-13" eager />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{current.title}</p>
          <p className="truncate text-xs text-muted-foreground">{current.artist ?? current.subtitle}</p>
        </div>
        <LikeButton track={current} />
      </div>

      <div className="hidden flex-col items-center gap-1 lg:flex">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="Previous track" onClick={previous}><SkipBack aria-hidden="true" className="fill-current" /></Button>
          <Button size="icon-lg" className="rounded-full before:rounded-full" aria-label={playLabel} onClick={toggle}><PlayIcon aria-hidden="true" className="fill-current" /></Button>
          <Button size="icon" variant="ghost" disabled={queue.index === queue.tracks.length - 1} aria-label="Next track" onClick={next}><SkipForward aria-hidden="true" className="fill-current" /></Button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-end font-mono text-[11px] text-muted-foreground tabular-nums">{formatTime(time)}</span>
          <input type="range" min={0} max={seekMax} step={1} value={Math.min(Math.floor(time), seekMax)} onChange={(event) => seek(event.target.value)} aria-label="Seek" aria-valuetext={seekLabel} className="h-1 flex-1 cursor-pointer accent-foreground" />
          <span className="w-10 font-mono text-[11px] text-muted-foreground tabular-nums">{formatTime(length) ?? "--:--"}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <div className="hidden w-32 items-center gap-1 xl:flex">
          <Button size="icon-sm" variant="ghost" aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>
            {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
          <input type="range" min={0} max={100} step={5} value={muted ? 0 : Math.round(volume * 100)} onChange={(event) => { setVolume(Number(event.target.value) / 100); setMuted(false); }} aria-label="Volume" className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground" />
        </div>
        <Button size="icon" className="rounded-full before:rounded-full lg:hidden" aria-label={playLabel} onClick={toggle}><PlayIcon aria-hidden="true" className="fill-current" /></Button>
        <Button size="icon" variant="ghost" className="lg:hidden" disabled={queue.index === queue.tracks.length - 1} aria-label="Next track" onClick={next}><SkipForward aria-hidden="true" className="fill-current" /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close player and clear queue" title="Close player and clear queue" onClick={() => dispatch({ type: "clear" })}><X aria-hidden="true" /></Button>
      </div>

      <div className="col-span-full flex items-center gap-2 px-1 lg:hidden">
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{formatTime(time)}</span>
        <input type="range" min={0} max={seekMax} step={1} value={Math.min(Math.floor(time), seekMax)} onChange={(event) => seek(event.target.value)} aria-label="Seek" aria-valuetext={seekLabel} className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground" />
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{formatTime(length) ?? "--:--"}</span>
      </div>

      {streamError && (
        <div className="col-span-full flex flex-wrap items-center gap-2 px-1 text-xs text-destructive-foreground" role="alert">
          <span>{streamError}</span>
          <Button variant="outline" size="xs" onClick={() => dispatch({ type: "select", index: queue.index })}>Retry</Button>
        </div>
      )}

      <audio
        key={`${current.sourceId}-${revision}`}
        ref={audio}
        className="hidden"
        autoPlay={autoplay}
        preload="none"
        src={`/api/audio?id=${encodeURIComponent(current.sourceId)}`}
        onLoadStart={() => setStreamError(null)}
        onLoadedMetadata={(event) => setPosition({ key: playbackKey, time: event.currentTarget.currentTime, length: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null })}
        onTimeUpdate={(event) => setPosition({ key: playbackKey, time: event.currentTarget.currentTime, length: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : length })}
        onEnded={() => { setPaused(true); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; next(); }}
        onPlaying={() => { setStreamError(null); setPaused(false); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; }}
        onPause={() => { setPaused(true); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; }}
        onError={() => setStreamError("Could not stream this track. YouTube may block this server or the track may be unavailable.")}
      />
    </footer>
  );
}

const reveal = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

export function UpNext() {
  const { queue, dispatch } = useListening();
  if (!queue.tracks.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia><ListMusic aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
          <EmptyTitle>Nothing is playing</EmptyTitle>
          <EmptyDescription>Press Play on a song, album, or playlist. The queue stays in this browser.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <ol className="flex flex-col">
        {queue.tracks.map((track, index) => {
          const playing = index === queue.index;
          return (
            <li key={`${track.sourceId}-${index}`} className={cn("group flex min-w-0 items-center gap-1 rounded-lg p-1 hover:bg-accent", playing && "bg-accent")}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-current={playing ? "true" : undefined} onClick={() => dispatch({ type: "select", index })}>
                <Artwork src={track.thumbnail} className="size-10" />
                <span className="min-w-0">
                  <span className={cn("flex items-center gap-1.5 text-sm font-medium", playing && "text-brand")}>
                    {playing && <AudioLines aria-hidden="true" className="size-3.5 shrink-0" />}
                    <span className="truncate">{track.title}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{track.artist ?? track.subtitle}</span>
                </span>
              </button>
              <span className={cn("flex shrink-0 items-center", reveal)}>
                <Button size="icon-xs" variant="ghost" disabled={index === 0} aria-label={`Move ${track.title} up`} onClick={() => dispatch({ type: "move", index, direction: -1 })}><ArrowUp aria-hidden="true" /></Button>
                <Button size="icon-xs" variant="ghost" disabled={index === queue.tracks.length - 1} aria-label={`Move ${track.title} down`} onClick={() => dispatch({ type: "move", index, direction: 1 })}><ArrowDown aria-hidden="true" /></Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Remove ${track.title} from queue`} onClick={() => dispatch({ type: "remove", index })}><X aria-hidden="true" /></Button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-2 px-2">
        <p className="text-xs text-muted-foreground"><span className="font-mono tabular-nums">{queue.index + 1}</span> of <span className="font-mono tabular-nums">{queue.tracks.length}</span> · up to <span className="font-mono tabular-nums">{MAX_QUEUE}</span></p>
        <Button variant="ghost" size="xs" onClick={() => dispatch({ type: "clear" })}>Clear queue</Button>
      </div>
    </>
  );
}
