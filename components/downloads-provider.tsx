"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { newlyCompleted } from "@/lib/completed";
import { AUDIO_FORMATS, type AudioFormat, type DownloadJob, type JobStatus, type SearchItem, type Subscription } from "@/lib/types";
import { toastManager } from "@/components/ui/toast";

type Source = Pick<SearchItem, "kind" | "sourceId">;
type DownloadsContext = {
  jobs: DownloadJob[];
  subscriptions: Subscription[];
  navidromeUrl: string;
  jobFor: (item: Source) => DownloadJob | undefined;
  download: (item: SearchItem) => Promise<boolean>;
  act: (job: DownloadJob, action: "cancel" | "retry") => Promise<void>;
  clearFinished: () => Promise<void>;
  isFollowing: (item: Source) => boolean;
  toggleFollow: (item: SearchItem) => Promise<void>;
  requestInLidarr: (item: SearchItem) => Promise<void>;
};
const Context = createContext<DownloadsContext | null>(null);

export function useDownloads() {
  const context = useContext(Context);
  if (!context) throw new Error("DownloadsProvider is required.");
  return context;
}

export function isActive(job: DownloadJob) {
  return job.status === "queued" || job.status === "running" || job.status === "retrying";
}

export function isCompleted(job: DownloadJob) {
  return job.status === "completed" || job.status === "completed_with_warnings";
}

// Navidrome filters albums by name and songs by title; unmatched titles leave the list unfiltered.
// Downloaded playlists become album folders, so use the album view for them.
export function navidromeLink(job: DownloadJob, baseUrl: string) {
  if (!baseUrl) return null;
  const resource = job.kind === "song" ? "song" : "album";
  const filter = job.kind === "song" ? { title: job.title } : { name: job.title };
  return `${baseUrl}/app/#/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;
}

function sourceKey(item: Source) {
  return `${item.kind}-${item.sourceId}`;
}

// The settings page stores the choice per browser; without it the server's default format applies.
function storedFormat(): AudioFormat | undefined {
  try {
    const stored = localStorage.getItem("muzik-format") as AudioFormat | null;
    return stored && AUDIO_FORMATS.includes(stored) ? stored : undefined;
  } catch { return undefined; }
}

function failed(title: string, cause: unknown, fallback: string) {
  toastManager.add({ type: "error", title, description: cause instanceof Error && cause.message ? cause.message : fallback });
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [navidromeUrl, setNavidromeUrl] = useState("");
  const statuses = useRef<Map<string, JobStatus> | null>(null);

  const applyJobs = useCallback((next: DownloadJob[]) => {
    for (const job of newlyCompleted(statuses.current, next)) {
      toastManager.add({ id: `completed-${job.id}`, type: "success", title: "Download complete", description: `${job.title} is ready to play.` });
    }
    statuses.current = new Map(next.map((job) => [job.id, job.status]));
    setJobs(next);
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (response.ok) applyJobs((await response.json()).jobs as DownloadJob[]);
    } catch { /* the stream or the next poll retries */ }
  }, [applyJobs]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [subscriptionResponse, settingsResponse] = await Promise.all([fetch("/api/subscriptions", { cache: "no-store" }), fetch("/api/settings", { cache: "no-store" })]);
        if (active && subscriptionResponse.ok) setSubscriptions((await subscriptionResponse.json()).subscriptions as Subscription[]);
        if (active && settingsResponse.ok) setNavidromeUrl(((await settingsResponse.json()).navidrome?.url as string | undefined) ?? "");
      } catch { /* both lists reload with the next change */ }
    })();
    return () => { active = false; };
  }, []);

  // Keep SSE separate from polling so queue activity changes do not reconnect and drop events.
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

  // Keep polling as a fallback for proxies that deliver the first SSE event but buffer later ones.
  const busy = jobs.some(isActive);
  useEffect(() => {
    const timer = window.setInterval(loadJobs, busy ? 1_000 : 5_000);
    return () => window.clearInterval(timer);
  }, [busy, loadJobs]);

  // Newest job wins so a retried download reflects its latest attempt.
  const bySource = useMemo(() => new Map(jobs.map((job) => [sourceKey(job), job] as const).reverse()), [jobs]);
  const jobFor = useCallback((item: Source) => bySource.get(sourceKey(item)), [bySource]);

  const download = useCallback(async (item: SearchItem) => {
    try {
      const format = storedFormat();
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: item.kind, sourceId: item.sourceId, url: item.url ?? null, title: item.title, subtitle: item.subtitle,
          artist: item.artist, album: item.album, thumbnail: item.thumbnail, durationSeconds: item.durationSeconds,
          trackNumber: item.trackNumber, ...(format && { format }),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toastManager.add({ id: `queued-${data.job.id}`, type: data.created ? "success" : "info", title: data.created ? "Added to downloads" : "Already downloading", description: item.title });
      await loadJobs();
      return true;
    } catch (cause) {
      failed("Could not start the download", cause, "The server refused the download.");
      return false;
    }
  }, [loadJobs]);

  const act = useCallback(async (job: DownloadJob, action: "cancel" | "retry") => {
    try {
      const response = await fetch(`/api/jobs/${job.id}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error);
    } catch (cause) {
      failed(action === "cancel" ? "Could not cancel the download" : "Could not retry the download", cause, "Try again in a moment.");
    }
    await loadJobs();
  }, [loadJobs]);

  const clearFinished = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setJobs(data.jobs as DownloadJob[]);
    } catch (cause) { failed("Could not clear finished downloads", cause, "Try again in a moment."); }
  }, []);

  const isFollowing = useCallback((item: Source) => subscriptions.some((entry) => entry.sourceId === item.sourceId), [subscriptions]);

  const toggleFollow = useCallback(async (item: SearchItem) => {
    if (item.kind === "song") return;
    const existing = subscriptions.find((entry) => entry.sourceId === item.sourceId);
    try {
      if (existing) {
        const response = await fetch(`/api/subscriptions?id=${existing.id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSubscriptions(data.subscriptions as Subscription[]);
        return;
      }
      const format = storedFormat();
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, sourceId: item.sourceId, title: item.title, subtitle: item.subtitle, thumbnail: item.thumbnail, ...(format && { format }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const list = await fetch("/api/subscriptions", { cache: "no-store" });
      if (list.ok) setSubscriptions((await list.json()).subscriptions as Subscription[]);
      if (data.created) toastManager.add({ id: `followed-${data.subscription.id}`, type: "success", title: "Following", description: `${item.title} syncs every ${data.subscription.intervalHours}h.` });
    } catch (cause) {
      failed(existing ? "Could not stop following" : "Could not follow", cause, "Try again in a moment.");
    }
  }, [subscriptions]);

  const requestInLidarr = useCallback(async (item: SearchItem) => {
    try {
      const response = await fetch("/api/lidarr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artist: item.artist, album: item.album }) });
      const data: { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Lidarr request failed.");
      toastManager.add({ id: `lidarr-${sourceKey(item)}`, type: "success", title: "Requested in Lidarr", description: data.message });
    } catch (cause) { failed("Lidarr request failed", cause, "Lidarr request failed."); }
  }, []);

  const value = useMemo(
    () => ({ jobs, subscriptions, navidromeUrl, jobFor, download, act, clearFinished, isFollowing, toggleFollow, requestInLidarr }),
    [jobs, subscriptions, navidromeUrl, jobFor, download, act, clearFinished, isFollowing, toggleFollow, requestInLidarr],
  );
  return <Context value={value}>{children}</Context>;
}
