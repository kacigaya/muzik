"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Clock, Disc3, Download, GalleryVerticalEnd, Github, Heart, House, ListMusic, Music2, Plus, RefreshCw, Search, Settings, X } from "lucide-react";
import { Moon, Sun } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Artwork } from "@/components/artwork";
import { isActive, isCompleted, navidromeLink, useDownloads } from "@/components/downloads-provider";
import { GalleryVerticalEndIcon } from "@/components/icons/gallery-vertical-end";
import { SettingsIcon } from "@/components/icons/settings";
import { PlayerBar, UpNext, useListening } from "@/components/listening-provider";
import { collectionHref } from "@/components/music-ui";
import { Autocomplete, AutocompleteEmpty, AutocompleteInput, AutocompleteItem, AutocompleteList, AutocompletePopup } from "@/components/ui/autocomplete";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { isMusicLink } from "@/lib/link";
import { formatRemaining } from "@/lib/music";
import type { DownloadJob, JobStatus, SearchItem, SearchResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDE_SHEET = "side-sheet";
const subscribeToHydration = () => () => {};

const NAV = [
  { href: "/", label: "Home", icon: House, desktopIcon: House },
  { href: "/saved", label: "Saved", icon: Heart, desktopIcon: Heart },
  { href: "/library", label: "Library", icon: GalleryVerticalEnd, desktopIcon: GalleryVerticalEndIcon },
  { href: "/settings", label: "Settings", icon: Settings, desktopIcon: SettingsIcon },
];

export function focusSearch() {
  document.getElementById("music-search")?.focus();
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { error } = useListening();
  const { jobs } = useDownloads();
  const running = jobs.find((job) => job.status === "running");
  const active = jobs.filter(isActive).length;

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        focusSearch();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <div className="flex h-dvh flex-col gap-2 bg-background p-2 max-lg:pb-0">
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card">
          <TopBar active={active} />
          <main id="main-content" tabIndex={-1} className="@container min-h-0 flex-1 overflow-y-auto outline-none">
            {children}
          </main>
        </div>
        <aside aria-label="Queue and downloads" className="hidden min-h-0 flex-col rounded-2xl border bg-card xl:flex">
          <SidePanel />
        </aside>
      </div>
      {error && <p className="px-2 text-sm text-destructive-foreground" role="alert">{error}</p>}
      <PlayerBar />
      <MobileNav />
      <div id={SIDE_SHEET} popover="auto" aria-label="Queue and downloads" className="inset-auto top-16 right-2 left-2 m-0 w-auto rounded-2xl border bg-card p-0 text-foreground shadow-lg sm:left-auto sm:w-96 xl:hidden">
        <div className="flex max-h-[calc(100dvh-6rem)] flex-col">
          <SidePanel closable />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {running ? `${running.title}: downloading, ${running.progress}%.` : active ? `${active} downloads queued.` : ""}
      </p>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { library, loading } = useListening();
  const { subscriptions } = useDownloads();
  return (
    <div className="hidden min-h-0 flex-col gap-2 lg:flex">
      <nav aria-label="Primary" className="rounded-2xl border bg-card p-2">
        <Link href="/" className="mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Music2 aria-hidden="true" className="size-5" />Muzik
        </Link>
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, desktopIcon: Icon }) => {
            const current = pathname === href;
            return (
              <li key={href}>
                <Button variant={current ? "secondary" : "ghost"} className={cn("w-full justify-start gap-3 px-2.5", !current && "text-muted-foreground")} render={<Link href={href} />} aria-current={current ? "page" : undefined}>
                  <Icon aria-hidden="true" />{label}
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
      <section aria-label="Your music" className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border bg-card px-1.5 pb-2">
        <div className="flex items-center justify-between gap-2 px-1.5 pt-2.5 pb-1">
          <h2 className="text-xs font-medium text-muted-foreground">Playlists</h2>
          <Button variant="ghost" size="icon-sm" render={<Link href="/saved?new=1" />} aria-label="Create playlist"><Plus aria-hidden="true" /></Button>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2 p-1.5">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-10 w-full rounded-md" />)}</div>
        ) : (
          <ul>
            <li>
              <SidebarLink href="/saved" title="Liked songs" meta={`${library.likes.length} songs`} art={<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Heart aria-hidden="true" className="size-4 fill-current" /></span>} />
            </li>
            {library.playlists.map((playlist) => (
              <li key={playlist.id}>
                <SidebarLink href={`/saved?playlist=${playlist.id}`} title={playlist.name} meta={`${playlist.tracks.length} songs`} art={<Artwork src={playlist.tracks[0]?.thumbnail} icon={ListMusic} className="size-10" />} />
              </li>
            ))}
          </ul>
        )}
        {subscriptions.length > 0 && (
          <>
            <h2 className="px-1.5 pt-4 pb-1 text-xs font-medium text-muted-foreground">Following</h2>
            <ul>
              {subscriptions.map((subscription) => (
                <li key={subscription.id}>
                  <SidebarLink
                    href={collectionHref({ kind: subscription.kind, sourceId: subscription.sourceId, title: subscription.title, subtitle: subscription.subtitle, thumbnail: subscription.thumbnail })}
                    title={subscription.title}
                    meta={`Checks every ${subscription.intervalHours}h`}
                    art={<Artwork src={subscription.thumbnail} icon={Bell} className="size-10" />}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        <a className="mt-auto flex w-fit items-center gap-2 rounded-md px-1.5 pt-6 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="https://github.com/kacigaya" target="_blank" rel="noreferrer">
          <Github aria-hidden="true" className="size-3.5" />GitHub
        </a>
      </section>
    </div>
  );
}

function SidebarLink({ href, title, meta, art }: { href: string; title: string; meta: string; art: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg p-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
      {art}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
    </Link>
  );
}

function TopBar({ active }: { active: number }) {
  const { navidromeUrl } = useDownloads();
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4">
      <Link href="/" className="flex shrink-0 items-center rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label="Muzik home">
        <Music2 aria-hidden="true" className="size-5" />
      </Link>
      <Suspense fallback={<SearchFallback />}>
        <SearchBox />
      </Suspense>
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="relative xl:hidden" popoverTarget={SIDE_SHEET} aria-label={active ? `Queue and downloads, ${active} downloads active` : "Queue and downloads"}>
          <ListMusic aria-hidden="true" />
          {active > 0 && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground tabular-nums">{active}</span>}
        </Button>
        <ThemeToggle />
        {navidromeUrl && (
          <Button variant="outline" size="sm" className="max-sm:px-2" render={<a href={navidromeUrl} target="_blank" rel="noreferrer" />}>
            <span className="max-sm:sr-only">Navidrome</span><Disc3 aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SearchFallback() {
  return <div className="h-9 min-w-0 flex-1 rounded-lg border bg-background sm:h-8 lg:max-w-lg" />;
}

function SearchBox() {
  const q = useSearchParams().get("q") ?? "";
  return <SearchForm key={q} initial={q} />;
}

function SearchForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2 || isMusicLink(value) || value === initial) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as SearchResponse;
        setSuggestions([...data.songs, ...data.albums, ...data.playlists].slice(0, 8));
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
  }, [query, initial]);

  function change(value: string) {
    setQuery(value);
    setSuggestions([]);
    setSuggesting(value.trim().length >= 2 && !isMusicLink(value));
  }

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1 lg:max-w-lg"
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        if (value.length >= 2) router.push(`/?q=${encodeURIComponent(value)}`);
      }}
    >
      <label htmlFor="music-search" className="sr-only">Search music</label>
      <Autocomplete items={suggestions} value={query} onValueChange={change} itemToStringValue={(item: SearchItem) => item.title} mode="none" autoHighlight>
        <AutocompleteInput
          id="music-search"
          startAddon={<Search aria-hidden="true" />}
          className="*:data-[slot=input]:pe-9"
          minLength={2}
          maxLength={300}
          placeholder="Search or paste a link"
          enterKeyHint="search"
        />
        <Button type="submit" variant="ghost" size="icon-xs" disabled={query.trim().length < 2} className="absolute end-1 top-1/2 z-10 -translate-y-1/2" aria-label="Search">
          <Search aria-hidden="true" />
        </Button>
        <AutocompletePopup>
          <AutocompleteEmpty>{suggesting ? "Searching…" : "No suggestions found."}</AutocompleteEmpty>
          <AutocompleteList>
            {(item: SearchItem) => (
              <AutocompleteItem key={`${item.kind}-${item.sourceId}`} value={item} className="gap-2">
                <Artwork src={item.thumbnail} className="size-8" />
                <div className="min-w-0 text-start">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </form>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const label = hydrated && resolvedTheme ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme` : "Switch theme";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label={label}>
      <MorphIcon icon={hydrated && resolvedTheme ? (resolvedTheme === "dark" ? Moon : Sun) : undefined} spring="snappy" />
    </Button>
  );
}

function SidePanel({ closable = false }: { closable?: boolean }) {
  const { jobs } = useDownloads();
  const active = jobs.filter(isActive).length;
  return (
    <Tabs defaultValue="queue" className="min-h-0 flex-1 gap-0">
      <div className="flex items-center gap-1 border-b p-2">
        <TabsList className="w-full">
          <TabsTab value="queue">Up next</TabsTab>
          <TabsTab value="downloads">
            Downloads
            {active > 0 && <Badge size="sm" className="bg-brand/12 font-mono text-brand tabular-nums">{active}</Badge>}
          </TabsTab>
        </TabsList>
        {closable && <Button variant="ghost" size="icon-sm" popoverTarget={SIDE_SHEET} popoverTargetAction="hide" aria-label="Close queue and downloads"><X aria-hidden="true" /></Button>}
      </div>
      <TabsPanel value="queue" className="min-h-0 overflow-y-auto p-2"><UpNext /></TabsPanel>
      <TabsPanel value="downloads" className="min-h-0 overflow-y-auto p-2"><DownloadsList /></TabsPanel>
    </Tabs>
  );
}

const STATUS: Record<JobStatus, BadgeProps["variant"]> = {
  queued: "secondary",
  running: "info",
  retrying: "info",
  completed: "success",
  completed_with_warnings: "warning",
  failed: "error",
  cancelled: "error",
};

function statusLabel(job: DownloadJob) {
  if (job.status === "completed_with_warnings") return `Completed · ${job.warningCount} warning${job.warningCount === 1 ? "" : "s"}`;
  if (job.status === "running") return "Downloading";
  return job.status.charAt(0).toUpperCase() + job.status.slice(1);
}

function DownloadsList() {
  const { jobs, act, clearFinished, navidromeUrl } = useDownloads();
  const active = jobs.filter(isActive).length;
  // Retried jobs keep their list position; move active jobs up so progress stays visible.
  const ordered = [...jobs].sort((left, right) => Number(isActive(right)) - Number(isActive(left)));
  if (!jobs.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia><Download aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
          <EmptyTitle>No downloads yet</EmptyTitle>
          <EmptyDescription>Use the download button on a song, album, or playlist. Files go to your music folder.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <div className="flex min-h-8 items-center justify-between gap-2 px-2 pb-1">
        <p className="text-xs text-muted-foreground"><span className="font-mono tabular-nums">{active}</span> active · <span className="font-mono tabular-nums">{jobs.length - active}</span> finished</p>
        {jobs.length > active && <Button variant="ghost" size="xs" onClick={() => void clearFinished()}>Clear finished</Button>}
      </div>
      <ul className="flex flex-col gap-1">
        {ordered.map((job) => {
          const href = isCompleted(job) ? navidromeLink(job, navidromeUrl) : null;
          return (
            <li key={job.id} className="rounded-lg p-2 hover:bg-accent">
              <div className="flex items-center gap-3">
                <Artwork src={job.thumbnail} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{job.subtitle}</p>
                </div>
                {isActive(job) && <Button variant="ghost" size="icon-xs" aria-label={`Cancel ${job.title}`} onClick={() => void act(job, "cancel")}><X aria-hidden="true" /></Button>}
                {(job.status === "failed" || job.status === "cancelled") && <Button variant="ghost" size="icon-xs" aria-label={`Retry ${job.title}`} onClick={() => void act(job, "retry")}><RefreshCw aria-hidden="true" /></Button>}
                {job.status === "completed" && (href
                  ? <Button variant="ghost" size="icon-xs" render={<a href={href} target="_blank" rel="noreferrer" />} aria-label={`Open ${job.title} in Navidrome`}><Download aria-hidden="true" className="text-success-foreground" /></Button>
                  : <span role="img" aria-label="Completed" className="flex size-6 items-center justify-center"><Download aria-hidden="true" className="size-3.5 text-success-foreground" /></span>)}
              </div>
              {(job.status !== "completed" || job.format === "flac" || job.itemCount) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-13">
                  {job.status !== "completed" && <Badge variant={STATUS[job.status]} size="sm">{statusLabel(job)}</Badge>}
                  {job.status === "queued" && <Clock aria-hidden="true" className="size-3 text-muted-foreground" />}
                  {job.status === "running" && (
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {[job.speed, job.etaSeconds != null ? `${formatRemaining(job.etaSeconds)} left` : null, job.kind !== "song" && !job.itemCount ? `${job.downloadedItems} downloaded` : `${job.progress}%`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {job.itemCount && <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{job.itemIndex ?? 0} / {job.itemCount}</span>}
                  {job.format === "flac" && <span className="font-mono text-[10px] text-muted-foreground">FLAC from a lossy source</span>}
                </div>
              )}
              {job.status === "running" && (job.kind === "song" || job.itemCount) && (
                <Progress value={job.progress} aria-label={`${job.title} download progress`} className="mt-2 ps-13">
                  <ProgressTrack className="h-1"><ProgressIndicator className="bg-brand" /></ProgressTrack>
                </Progress>
              )}
              {job.error && <p className="mt-1.5 ps-13 text-xs text-destructive-foreground">{job.error}</p>}
              {job.metadataWarning && <p className="mt-1.5 ps-13 text-xs text-warning-foreground">{job.metadataWarning}</p>}
              {job.scanWarning && <p className="mt-1.5 ps-13 text-xs text-warning-foreground">{job.scanWarning}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="grid shrink-0 grid-cols-4 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const current = pathname === href;
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined} className={cn("flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", current ? "text-foreground" : "text-muted-foreground")}>
            <Icon aria-hidden="true" className="size-5" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
