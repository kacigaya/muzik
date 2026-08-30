"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Brush, Check, ChevronDown, Clock, Download, Github, Music2, RefreshCw, Search, X } from "lucide-react";
import type { AudioFormat, DownloadJob, JobStatus, SearchItem, SearchResponse, Subscription } from "@/lib/types";
import { AUDIO_FORMATS } from "@/lib/types";
import { newlyCompleted } from "@/lib/completed";
import { isMusicLink } from "@/lib/link";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/components/ui/autocomplete";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { toastManager } from "@/components/ui/toast";
import { SiteNav } from "@/components/site-nav";

type GroupKey = keyof Pick<SearchResponse, "songs" | "albums" | "playlists">;

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "playlists", label: "Playlists" },
];


/** The queue only shows this many jobs until the visitor asks for the rest. */
const QUEUE_PREVIEW = 6;

const STATUS_BADGE: Record<JobStatus, BadgeProps["variant"]> = {
  queued: "secondary",
  running: "info",
  retrying: "info",
  completed: "success",
  completed_with_warnings: "warning",
  failed: "error",
  cancelled: "error",
};

function duration(seconds: number | null) {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** yt-dlp reports seconds; anything past an hour is shown as hours and minutes. */
function remaining(seconds: number) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function meta(item: SearchItem) {
  return duration(item.durationSeconds) ?? (item.itemCount ? `${item.itemCount} tracks` : null);
}

function sourceKey(item: Pick<SearchItem, "kind" | "sourceId">) {
  return `${item.kind}-${item.sourceId}`;
}

// Navidrome's list views filter albums by `name` and songs by `title`; an unmatched
// title simply lands on the unfiltered list instead of breaking the link. Playlists are
// downloaded into an album folder named after the playlist, so they use the album view.
function navidromeLink(job: DownloadJob, baseUrl: string) {
  if (!baseUrl) return null;
  const resource = job.kind === "song" ? "song" : "album";
  const filter = job.kind === "song" ? { title: job.title } : { name: job.title };
  return `${baseUrl}/app/#/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;
}

function linkResults(url: string, items: SearchItem[]): SearchResponse {
  return {
    query: url,
    songs: items.filter((item) => item.kind === "song"),
    albums: items.filter((item) => item.kind === "album"),
    playlists: items.filter((item) => item.kind === "playlist"),
  };
}

function NavidromeCheck({ job, size, baseUrl, className }: { job: DownloadJob; size: "icon-sm" | "icon-xs"; baseUrl: string; className?: string }) {
  const href = navidromeLink(job, baseUrl);
  const tone = job.status === "completed" ? "text-success-foreground" : "text-warning-foreground";
  if (!href) {
    return (
      <span aria-label="Completed" className={`flex size-8 shrink-0 items-center justify-center sm:size-7 ${className ?? ""}`} role="img">
        <Check aria-hidden="true" className={`size-4 ${tone}`} />
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size={size}
      className={className}
      render={<a href={href} target="_blank" rel="noreferrer" />}
      aria-label={`Open ${job.title} in Navidrome`}
    >
      <Check aria-hidden="true" className={tone} />
    </Button>
  );
}

function statusLabel(job: DownloadJob) {
  if (job.status === "completed_with_warnings") {
    return `Completed · ${job.warningCount} skipped`;
  }
  return job.status.replaceAll("_", " ");
}

function isActive(job: DownloadJob) {
  return job.status === "queued" || job.status === "running" || job.status === "retrying";
}

function isCompleted(job: DownloadJob) {
  return job.status === "completed" || job.status === "completed_with_warnings";
}

function focusSearch() {
  document.getElementById("music-search")?.focus();
}

export function MuzikApp({ navidromeUrl }: { navidromeUrl: string }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupKey>("songs");
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [format, setFormat] = useState<AudioFormat>(AUDIO_FORMATS[0]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Record<string, SearchItem[]>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAllJobs, setShowAllJobs] = useState(false);
  const jobStatuses = useRef<Map<string, JobStatus> | null>(null);

  const applyJobs = useCallback((nextJobs: DownloadJob[]) => {
    for (const job of newlyCompleted(jobStatuses.current, nextJobs)) {
      toastManager.add({ id: `completed-${job.id}`, type: "success", title: "Download complete", description: `${job.title} is ready to play.` });
    }
    jobStatuses.current = new Map(nextJobs.map((job) => [job.id, job.status]));
    setJobs(nextJobs);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (response.ok) applyJobs((await response.json()).jobs as DownloadJob[]);
    } catch { /* the stream or the next poll retries */ }
  }, [applyJobs]);

  const loadSubscriptions = useCallback(async () => {
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      if (response.ok) setSubscriptions((await response.json()).subscriptions as Subscription[]);
    } catch { /* subscriptions reload with the next change */ }
  }, []);

  const busy = jobs.some((job) => job.status === "running" || job.status === "queued" || job.status === "retrying");
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    if (isMusicLink(value)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as SearchResponse;
        setSuggestions(GROUPS.flatMap((group) => data[group.key]).slice(0, 8));
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggesting(false);
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || ["INPUT", "TEXTAREA"].includes(target?.tagName ?? "");
      if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        focusSearch();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    function restoreFormat() {
      const stored = window.localStorage.getItem("muzik-format") as AudioFormat | null;
      if (stored && AUDIO_FORMATS.includes(stored)) setFormat(stored);
    }
    void (async () => {
      await loadSubscriptions();
      restoreFormat();
    })();
    // The format now lives on its own page, so another tab can change it under us.
    window.addEventListener("storage", restoreFormat);
    return () => window.removeEventListener("storage", restoreFormat);
  }, [loadSubscriptions]);

  // SSE gives immediate updates when supported. Kept out of the polling effect because it
  // must not be torn down every time the queue goes busy or idle: reconnecting drops the
  // events that arrive in between, which is exactly when they matter most.
  useEffect(() => {
    const source = new EventSource("/api/jobs/stream");
    source.onmessage = (event) => {
      try {
        applyJobs(JSON.parse(event.data).jobs as DownloadJob[]);
      } catch { /* malformed frame, the next one replaces it */ }
    };
    const initial = window.setTimeout(loadJobs, 0);
    return () => {
      source.close();
      window.clearTimeout(initial);
    };
  }, [applyJobs, loadJobs]);

  // Polling always stays active because some proxies deliver the first event, then buffer
  // later events on the same connection. Only the interval follows the queue.
  useEffect(() => {
    const timer = window.setInterval(loadJobs, busy ? 1_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [busy, loadJobs]);

  async function searchMusic(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    setMessage(null);
    try {
      const link = isMusicLink(trimmed);
      const endpoint = link ? `/api/resolve?url=${encodeURIComponent(trimmed)}` : `/api/search?q=${encodeURIComponent(trimmed)}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const next: SearchResponse = link ? linkResults(trimmed, data.items) : data;
      setResults(next);
      const firstPopulated = GROUPS.find((group) => next[group.key].length);
      setActiveGroup((firstPopulated ?? GROUPS[0]).key);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSuggestions([]);
    setSuggesting(value.trim().length >= 2 && !isMusicLink(value));
  }

  async function add(item: SearchItem, quiet = false) {
    setMessage(null);
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        sourceId: item.sourceId,
        url: item.url ?? null,
        title: item.title,
        subtitle: item.subtitle,
        thumbnail: item.thumbnail,
        format,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return false;
    }
    if (!quiet) {
      toastManager.add({
        id: `queued-${data.job.id}`,
        type: data.created ? "success" : "info",
        title: data.created ? "Added to queue" : "Already queued",
        description: item.title,
      });
    }
    await loadJobs();
    return true;
  }

  async function toggleTracks(item: SearchItem) {
    const key = sourceKey(item);
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (tracks[key]) return;
    try {
      const response = await fetch(`/api/tracks?kind=${item.kind}&id=${encodeURIComponent(item.sourceId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTracks((current) => ({ ...current, [key]: data.items as SearchItem[] }));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not load the track list.");
      setExpanded(null);
    }
  }

  function toggleTrack(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected(key: string) {
    const chosen = (tracks[key] ?? []).filter((track) => selected.has(track.sourceId));
    if (!chosen.length) return;
    let queued = 0;
    for (const track of chosen) {
      if (await add(track, true)) queued += 1;
    }
    setSelected(new Set());
    toastManager.add({ id: `queued-many-${key}`, type: "success", title: `Added ${queued} tracks`, description: "They download one after another." });
  }

  async function follow(item: SearchItem) {
    if (item.kind === "song") return;
    setMessage(null);
    const existing = subscriptions.find((entry) => entry.sourceId === item.sourceId);
    if (existing) {
      const response = await fetch(`/api/subscriptions?id=${existing.id}`, { method: "DELETE" });
      if (response.ok) setSubscriptions((await response.json()).subscriptions as Subscription[]);
      return;
    }
    const response = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        sourceId: item.sourceId,
        title: item.title,
        subtitle: item.subtitle,
        thumbnail: item.thumbnail,
        format,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    await loadSubscriptions();
    if (data.created) {
      toastManager.add({ id: `followed-${data.subscription.id}`, type: "success", title: "Following", description: `${item.title} syncs every ${data.subscription.intervalHours}h.` });
    }
  }

  async function unfollow(subscription: Subscription) {
    const response = await fetch(`/api/subscriptions?id=${subscription.id}`, { method: "DELETE" });
    if (response.ok) setSubscriptions((await response.json()).subscriptions as Subscription[]);
  }

  async function act(job: DownloadJob, action: "cancel" | "retry") {
    const response = await fetch(`/api/jobs/${job.id}/${action}`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) setMessage(data.error);
    await loadJobs();
  }

  async function clearFinished() {
    const response = await fetch("/api/jobs", { method: "DELETE" });
    const data = await response.json();
    if (response.ok) {
      setJobs(data.jobs as DownloadJob[]);
      // Clearing is the only way the queue shrinks, so a later refill starts collapsed again.
      setShowAllJobs(false);
    } else setMessage(data.error ?? "Could not clear the queue.");
  }

  const activeJobs = jobs.filter(isActive).length;
  const runningJob = jobs.find((job) => job.status === "running");
  // The worker takes the newest queued job first, so unfinished work can sit anywhere in the
  // list; floating it keeps live progress inside the preview.
  const orderedJobs = [...jobs].sort((left, right) => Number(isActive(right)) - Number(isActive(left)));
  const visibleJobs = showAllJobs ? orderedJobs : orderedJobs.slice(0, QUEUE_PREVIEW);
  const compact = Boolean(results) || loading;
  const following = new Set(subscriptions.map((entry) => entry.sourceId));
  // Newest job wins so a retried download reflects its latest attempt.
  const jobBySource = new Map(jobs.map((job) => [sourceKey(job), job] as const).reverse());

  function itemAction(item: SearchItem) {
    const job = jobBySource.get(sourceKey(item));
    if (job && isCompleted(job)) return <NavidromeCheck job={job} size="icon-sm" baseUrl={navidromeUrl} />;
    if (job?.status === "running" || job?.status === "queued" || job?.status === "retrying") {
      return (
        <Button variant="ghost" size="icon-sm" disabled aria-label={`${item.title} is ${job.status}`}>
          {job.status === "running"
            ? <Spinner aria-hidden="true" role="presentation" className="size-4 text-brand" />
            : <Clock aria-hidden="true" />}
        </Button>
      );
    }
    return (
      <Button variant="outline" size="icon-sm" onClick={() => add(item)} aria-label={`Download ${item.title}`}>
        <Download aria-hidden="true" />
      </Button>
    );
  }

  function resultGrid(items: SearchItem[], label: string) {
    if (!items.length) {
      return (
        <Empty className="rounded-2xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia><Music2 aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>No {label.toLowerCase()} found</EmptyTitle>
            <EmptyDescription>Try another title, artist, or category.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={focusSearch}>Change search</Button>
          </EmptyContent>
        </Empty>
      );
    }
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const key = sourceKey(item);
          const collection = item.kind !== "song" && !item.url;
          const open = expanded === key;
          const listed = tracks[key];
          const chosen = (listed ?? []).filter((track) => selected.has(track.sourceId)).length;
          return (
            <Card className={`min-w-0 p-2.5 ${open ? "sm:col-span-2" : ""}`} key={key}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                  {item.thumbnail ? (
                    // Provider artwork hosts vary; native lazy loading avoids an unsafe wildcard image proxy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnail} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <Music2 aria-hidden="true" className="size-5" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.subtitle}
                    {meta(item) && <span className="font-mono tabular-nums text-muted-foreground/72"> · {meta(item)}</span>}
                  </p>
                </div>
                {collection && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleTracks(item)}
                      aria-expanded={open}
                      aria-label={open ? `Hide tracks of ${item.title}` : `Show tracks of ${item.title}`}
                    >
                      <ChevronDown aria-hidden="true" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => follow(item)}
                      aria-label={following.has(item.sourceId) ? `Stop following ${item.title}` : `Follow ${item.title}`}
                    >
                      {following.has(item.sourceId)
                        ? <Bell aria-hidden="true" className="text-brand" />
                        : <BellOff aria-hidden="true" />}
                    </Button>
                  </>
                )}
                {itemAction(item)}
              </div>
              {open && (
                <div className="mt-2.5 border-t pt-2.5">
                  {!listed ? (
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}
                    </div>
                  ) : !listed.length ? (
                    <p className="text-xs text-muted-foreground">No tracks were listed for this collection.</p>
                  ) : (
                    <>
                      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                        {listed.map((track, index) => (
                          <li key={track.sourceId}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-accent/50">
                              <input
                                type="checkbox"
                                className="size-3.5 shrink-0 accent-[var(--brand)]"
                                checked={selected.has(track.sourceId)}
                                onChange={() => toggleTrack(track.sourceId)}
                              />
                              <span className="w-6 shrink-0 text-end font-mono text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
                              <span className="min-w-0 flex-1 truncate">{track.title}</span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{duration(track.durationSeconds)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{chosen} of {listed.length} selected</span>
                        <Button size="xs" disabled={!chosen} onClick={() => addSelected(key)}>
                          Download selected
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl={navidromeUrl} logoHref="#top" />

      <main className="flex-1">
        {/* Once results exist the hero collapses into a sticky search bar so results stay on screen. */}
        <section
          className={compact ? "sticky top-0 z-30 border-b bg-background/85 px-4 py-3 backdrop-blur" : "px-4 py-14 sm:py-20"}
          id="top"
          aria-labelledby="page-title"
        >
          <div className="mx-auto w-full max-w-2xl text-center">
            <h1
              id="page-title"
              className={compact ? "sr-only" : "font-heading text-4xl font-bold text-balance sm:text-5xl md:text-6xl"}
            >
              What do you want to listen to?
            </h1>
            <p className={compact ? "hidden" : "mx-auto mt-4 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base"}>
              Search YouTube Music, then save songs, albums, and playlists directly to Navidrome.
            </p>
            <form
              onSubmit={searchMusic}
              className={`relative mx-auto max-w-xl ${compact ? "" : "mt-8"}`}
            >
              <Field name="query">
                <FieldLabel className="sr-only">Search music</FieldLabel>
                <Autocomplete
                  items={suggestions}
                  value={query}
                  onValueChange={changeQuery}
                  itemToStringValue={(item: SearchItem) => item.title}
                  mode="none"
                  autoHighlight
                >
                  <AutocompleteInput
                    id="music-search"
                    size="lg"
                    startAddon={<Search aria-hidden="true" />}
                    className="rounded-xl before:rounded-[calc(var(--radius-xl)-1px)] shadow-sm/5 *:data-[slot=input]:pe-24"
                    minLength={2}
                    maxLength={300}
                    placeholder="Search music or paste a YouTube link"
                    aria-describedby={message ? "search-message" : undefined}
                  />
                  <Button type="submit" size="sm" loading={loading} disabled={query.trim().length < 2} className="absolute end-1 top-1/2 z-10 -translate-y-1/2">
                      <Search aria-hidden="true" className="sm:hidden" />
                      <span className="max-sm:sr-only">Search</span>
                  </Button>
                  <AutocompletePopup>
                    <AutocompleteEmpty>{suggesting ? "Searching…" : "No suggestions found."}</AutocompleteEmpty>
                    <AutocompleteList>
                      {(item: SearchItem) => (
                        <AutocompleteItem key={sourceKey(item)} value={item} className="gap-2">
                          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {item.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.thumbnail} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Music2 aria-hidden="true" className="size-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 text-start">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                          </div>
                        </AutocompleteItem>
                      )}
                    </AutocompleteList>
                  </AutocompletePopup>
                </Autocomplete>
                <FieldError />
              </Field>
            </form>
            {message && (
              <div
                className="mx-auto mt-4 flex w-fit max-w-full items-center gap-2 rounded-lg border bg-card py-1 ps-3 pe-1 text-start text-xs text-muted-foreground"
                id="search-message"
                role="status"
              >
                {message}
                <Button variant="ghost" size="icon-xs" onClick={() => setMessage(null)} aria-label="Dismiss message">
                  <X aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* The hero pads the top itself; once it collapses to the sticky bar the grid has to. */}
        <div className={`mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_21rem] ${compact ? "pt-8" : ""}`}>
          <section className="min-w-0" aria-live="polite" aria-busy={loading}>
            <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
              <h2 className="min-w-0 truncate text-lg font-semibold text-balance">
                {results ? (isMusicLink(results.query) ? "Found in this link" : `Results for “${results.query}”`) : "Browse the catalog"}
              </h2>
              {results && (
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {GROUPS.reduce((total, group) => total + results[group.key].length, 0)} found
                </Badge>
              )}
            </div>
            {loading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Card className="flex-row items-center gap-3 p-2.5" key={index}>
                    <Skeleton className="size-13 shrink-0 rounded-lg" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : results ? (
              <Tabs value={activeGroup} onValueChange={(value) => setActiveGroup(value as GroupKey)}>
                <TabsList aria-label="Filter search results">
                  {GROUPS.map((group) => (
                    <TabsTab key={group.key} value={group.key}>
                      {group.label}
                      <Badge variant="secondary" size="sm" className="font-mono tabular-nums">
                        {results[group.key].length}
                      </Badge>
                    </TabsTab>
                  ))}
                </TabsList>
                {GROUPS.map((group) => (
                  <TabsPanel key={group.key} value={group.key}>
                    {resultGrid(results[group.key], group.label)}
                  </TabsPanel>
                ))}
              </Tabs>
            ) : (
              <Empty className="rounded-2xl border border-dashed py-16">
                <EmptyHeader>
                  <EmptyMedia><Search aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
                  <EmptyTitle>Search your next listen</EmptyTitle>
                  <EmptyDescription>Songs, albums, and playlists from YouTube Music will appear here.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={focusSearch}>Start searching</Button>
                  <p className="text-xs text-muted-foreground">
                    Press <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">/</kbd> or{" "}
                    <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd> to focus search.
                  </p>
                </EmptyContent>
              </Empty>
            )}
          </section>

          <aside aria-labelledby="queue-title" className="min-w-0 border-t pt-8 lg:border-t-0 lg:border-l lg:ps-8 lg:pt-0">
            <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
              <h2 id="queue-title" className="scroll-mt-24 text-lg font-semibold">Download queue</h2>
              <div className="flex items-center gap-1.5">
                {activeJobs > 0 && (
                  <Badge className="bg-brand/12 font-mono text-brand tabular-nums">{activeJobs} active</Badge>
                )}
                {jobs.length > activeJobs && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearFinished}
                    aria-label="Clear finished downloads"
                    title="Clear finished downloads"
                  >
                    <Brush aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            {jobs.length ? (
              <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1" id="queue-list">
                {visibleJobs.map((job) => job.status === "completed" ? (
                  /* Finished downloads collapse to one line; anything unfinished or warned keeps the full card. */
                  <Card className="min-w-0 flex-row items-center gap-2.5 p-2" key={job.id}>
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                      {job.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={job.thumbnail} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <Music2 aria-hidden="true" className="size-4" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-medium">{job.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{job.subtitle}</p>
                    </div>
                    <NavidromeCheck job={job} size="icon-sm" baseUrl={navidromeUrl} />
                  </Card>
                ) : (
                  <Card className="relative min-w-0 p-3" key={job.id}>
                    {isCompleted(job) && <NavidromeCheck job={job} size="icon-xs" baseUrl={navidromeUrl} className="absolute top-2 right-2" />}
                    <div className={`grid grid-cols-[--spacing(9)_minmax(0,1fr)] items-center gap-2.5 ${isCompleted(job) ? "pe-7" : ""}`}>
                      <div
                        className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
                      >
                        {job.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={job.thumbnail} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        ) : job.status === "running" ? (
                          <Spinner aria-hidden="true" role="presentation" className="size-4 text-brand" />
                        ) : (
                          <Music2 aria-hidden="true" className="size-4" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="truncate text-sm font-medium">{job.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{job.subtitle}</p>
                      </div>
                    </div>
                    {(!isCompleted(job) || job.status === "completed_with_warnings" || job.itemCount) && (
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        {!isCompleted(job) && (
                          <Badge variant={STATUS_BADGE[job.status]} size="sm" className="capitalize">{statusLabel(job)}</Badge>
                        )}
                        {job.status === "completed_with_warnings" && (
                          <Badge variant="warning" size="sm">{statusLabel(job)}</Badge>
                        )}
                        {job.itemCount && (
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            {job.itemIndex ?? 0} / {job.itemCount}
                          </span>
                        )}
                      </div>
                    )}
                    {job.status === "running" && (job.kind === "song" || job.itemCount) && (
                      <Progress value={job.progress} aria-label="Download progress" className="mt-2.5">
                        <ProgressTrack className="h-1">
                          <ProgressIndicator className="bg-brand" />
                        </ProgressTrack>
                      </Progress>
                    )}
                    {job.error && <p className="mt-2 text-xs leading-normal text-destructive-foreground">{job.error}</p>}
                    {job.metadataWarning && <p className="mt-2 text-xs leading-normal text-warning-foreground">{job.metadataWarning}</p>}
                    {job.scanWarning && <p className="mt-2 text-xs leading-normal text-warning-foreground">{job.scanWarning}</p>}
                    {(job.status === "queued" || job.status === "running" || job.status === "retrying" || job.status === "failed" || job.status === "cancelled") && (
                      <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
                        {(job.status === "queued" || job.status === "running" || job.status === "retrying") && (
                          <Button variant="ghost" size="xs" onClick={() => act(job, "cancel")}>
                            <X aria-hidden="true" /> Cancel
                          </Button>
                        )}
                        {(job.status === "failed" || job.status === "cancelled") && (
                          <Button variant="ghost" size="xs" onClick={() => act(job, "retry")}>
                            <RefreshCw aria-hidden="true" /> Retry
                          </Button>
                        )}
                        {job.status === "running" && (
                          <span className="ms-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground tabular-nums">
                            {job.speed && <span>{job.speed}</span>}
                            {job.etaSeconds != null && <span>{remaining(job.etaSeconds)} left</span>}
                            <span>{job.kind !== "song" && !job.itemCount ? `${job.downloadedItems} downloaded` : `${job.progress}%`}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              {jobs.length > QUEUE_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setShowAllJobs((value) => !value)}
                  aria-expanded={showAllJobs}
                  aria-controls="queue-list"
                >
                  {showAllJobs ? "Show less" : `Show ${jobs.length - QUEUE_PREVIEW} more`}
                  <ChevronDown aria-hidden="true" className={showAllJobs ? "rotate-180 transition-transform" : "transition-transform"} />
                </Button>
              )}
              </>
            ) : (
              <Empty className="rounded-2xl border border-dashed py-10">
                <EmptyHeader>
                  <EmptyMedia><Download aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
                  <EmptyTitle>Queue is empty</EmptyTitle>
                  <EmptyDescription>Choose a result to start a download.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" onClick={focusSearch}>Search music</Button>
                </EmptyContent>
              </Empty>
            )}

            {subscriptions.length > 0 && (
              <section aria-labelledby="following-title" className="mt-8 border-t pt-6">
                <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
                  <h2 id="following-title" className="text-lg font-semibold">Following</h2>
                  <Badge variant="secondary" className="font-mono tabular-nums">{subscriptions.length}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {subscriptions.map((subscription) => (
                    <Card className="min-w-0 flex-row items-center gap-2.5 p-2" key={subscription.id}>
                      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                        {subscription.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={subscription.thumbnail} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <Bell aria-hidden="true" className="size-4" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="truncate text-sm font-medium">{subscription.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Every {subscription.intervalHours}h
                          {subscription.lastCheckedAt && ` · checked ${new Date(subscription.lastCheckedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => unfollow(subscription)}
                        aria-label={`Stop following ${subscription.title}`}
                      >
                        <BellOff aria-hidden="true" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>

      {/* On small screens the queue sits far below the results, so active work gets a persistent bar. */}
      {activeJobs > 0 && (
        <a
          className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border bg-card/95 px-3 py-2 shadow-sm outline-none backdrop-blur focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          href="#queue-title"
        >
          <Spinner aria-hidden="true" role="presentation" className="size-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-xs">
            {runningJob ? runningJob.title : `${activeJobs} queued`}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
            {runningJob ? `${runningJob.progress}%` : `${activeJobs}`}
          </span>
        </a>
      )}

      <footer className="border-t">
        <p className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground">
          <a
            className="flex items-center gap-2 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="https://github.com/kacigaya"
            target="_blank"
            rel="noreferrer"
          >
            <Github aria-hidden="true" className="size-3.5 shrink-0" /> GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
