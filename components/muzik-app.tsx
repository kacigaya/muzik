"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Clock, Download, ExternalLink, Github, Music2, RefreshCw, Search, X } from "lucide-react";
import { Moon, Sun } from "lucide";
import { MorphIcon } from "morphicons/react";
import type { DownloadJob, JobStatus, SearchItem, SearchResponse } from "@/lib/types";
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

type GroupKey = keyof Pick<SearchResponse, "songs" | "albums" | "playlists">;

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "playlists", label: "Playlists" },
];


const STATUS_BADGE: Record<JobStatus, BadgeProps["variant"]> = {
  queued: "secondary",
  running: "info",
  completed: "success",
  completed_with_warnings: "warning",
  failed: "error",
  cancelled: "error",
};

function duration(seconds: number | null) {
  if (!seconds) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
  const jobStatuses = useRef<Map<string, JobStatus> | null>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (response.ok) {
        const nextJobs = (await response.json()).jobs as DownloadJob[];
        for (const job of newlyCompleted(jobStatuses.current, nextJobs)) {
          toastManager.add({ id: `completed-${job.id}`, type: "success", title: "Download complete", description: `${job.title} is ready in Navidrome.` });
        }
        jobStatuses.current = new Map(nextJobs.map((job) => [job.id, job.status]));
        setJobs(nextJobs);
      }
    } catch { /* next poll retries */ }
  }, []);

  const busy = jobs.some((job) => job.status === "running" || job.status === "queued");
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
    const initial = window.setTimeout(loadJobs, 0);
    const timer = window.setInterval(loadJobs, busy ? 1_000 : 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
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

  async function add(item: SearchItem) {
    setMessage(null);
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: item.kind,
        sourceId: item.sourceId,
        title: item.title,
        subtitle: item.subtitle,
        thumbnail: item.thumbnail,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      toastManager.add({
        id: `queued-${data.job.id}`,
        type: data.created ? "success" : "info",
        title: data.created ? "Added to queue" : "Already queued",
        description: item.title,
      });
    } else {
      setMessage(data.error);
    }
    await loadJobs();
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
    if (response.ok) setJobs(data.jobs as DownloadJob[]);
    else setMessage(data.error ?? "Could not clear the queue.");
  }

  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const runningJob = jobs.find((job) => job.status === "running");
  const compact = Boolean(results) || loading;
  // Newest job wins so a retried download reflects its latest attempt.
  const jobBySource = new Map(jobs.map((job) => [sourceKey(job), job] as const).reverse());

  function itemAction(item: SearchItem) {
    const job = jobBySource.get(sourceKey(item));
    if (job && isCompleted(job)) return <NavidromeCheck job={job} size="icon-sm" baseUrl={navidromeUrl} />;
    if (job?.status === "running" || job?.status === "queued") {
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
        {items.map((item) => (
          <Card className="min-w-0 flex-row items-center gap-3 p-2.5" key={`${item.kind}-${item.sourceId}`}>
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
            {itemAction(item)}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 pt-2 sm:px-8">
        <nav aria-label="Primary navigation" className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between rounded-xl border bg-card/80 pl-3 pr-1.5 shadow-sm backdrop-blur sm:pl-4 sm:pr-2">
          <a
            className="flex items-center gap-2.5 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="#top"
          >
            <Music2 aria-hidden="true" className="size-5" />
            Muzik
          </a>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            >
              {/* resolvedTheme is undefined until next-themes hydrates; morphicons paints the first icon without animating */}
              <MorphIcon icon={resolvedTheme ? (resolvedTheme === "dark" ? Moon : Sun) : undefined} spring="snappy" />
            </Button>
            {navidromeUrl && (
              <Button
                variant="outline"
                render={<a href={navidromeUrl} target="_blank" rel="noreferrer" />}
              >
                Open Navidrome <ExternalLink aria-hidden="true" />
              </Button>
            )}
          </div>
        </nav>
      </header>

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
            <form onSubmit={searchMusic} className={`relative mx-auto max-w-xl ${compact ? "" : "mt-8"}`}>
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
                    startAddon={<Search />}
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

        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
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
                  <Button variant="ghost" size="xs" onClick={clearFinished}>Clear done</Button>
                )}
              </div>
            </div>
            {jobs.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {jobs.map((job) => job.status === "completed" ? (
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
                    {(job.status === "queued" || job.status === "running" || job.status === "failed" || job.status === "cancelled") && (
                      <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
                        {(job.status === "queued" || job.status === "running") && (
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
                          <span className="ms-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                            {job.kind !== "song" && !job.itemCount ? `${job.downloadedItems} downloaded` : `${job.progress}%`}
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
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
