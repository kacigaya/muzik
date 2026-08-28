"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Folder, Music2, Trash2 } from "lucide-react";
import type { LibraryEntry } from "@/lib/types";
import { trackTitleFromName } from "@/lib/track-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { toastManager } from "@/components/ui/toast";

function size(bytes: number | null) {
  if (bytes == null) return null;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function parentOf(path: string) {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

export function LibraryBrowser() {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/library?path=${encodeURIComponent(next)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEntries(data.entries as LibraryEntry[]);
      setCanDelete(Boolean(data.canDelete));
      setPath(data.path as string);
    } catch (cause) {
      setEntries([]);
      setError(cause instanceof Error ? cause.message : "Could not read the library.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(""), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function remove(entry: LibraryEntry) {
    const label = entry.kind === "folder" ? `everything in ${entry.name}` : entry.name;
    if (!window.confirm(`Delete ${label}? This removes the files from disk.`)) return;
    const response = await fetch(`/api/library?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Could not delete that.");
      return;
    }
    toastManager.add({ id: `deleted-${entry.path}`, type: "success", title: "Deleted", description: entry.name });
    await load(path);
  }

  async function redownload(entry: LibraryEntry) {
    if (!entry.sourceId) return;
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "song",
        sourceId: entry.sourceId,
        url: null,
        // The queue shows this, so it gets the title rather than the file name yt-dlp wrote.
        title: trackTitleFromName(entry.name),
        subtitle: parentOf(entry.path) || "Library",
        thumbnail: null,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Could not queue that track.");
      return;
    }
    toastManager.add({
      id: `requeued-${entry.path}`,
      type: data.created ? "success" : "info",
      title: data.created ? "Added to queue" : "Already queued",
      description: entry.name,
    });
  }

  const segments = path.split("/").filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <div className="mb-6 flex min-h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!segments.length}
            onClick={() => load(parentOf(path))}
            aria-label="Go up one folder"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate font-heading text-xl font-semibold">
            {segments.length ? segments.at(-1) : "Library"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {entries && <Badge variant="secondary" className="font-mono tabular-nums">{entries.length}</Badge>}
          <Button variant="outline" size="sm" render={<Link href="/" />}>Back to search</Button>
        </div>
      </div>

      {segments.length > 0 && (
        <p className="mb-4 truncate font-mono text-xs text-muted-foreground">/{segments.join("/")}</p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border bg-card px-3 py-2 text-xs text-destructive-foreground" role="alert">{error}</p>
      )}

      {!entries ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, index) => <Skeleton className="h-12 w-full rounded-xl" key={index} />)}
        </div>
      ) : entries.length ? (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Card className="min-w-0 flex-row items-center gap-3 p-2.5" key={entry.path}>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {entry.kind === "folder" ? <Folder aria-hidden="true" className="size-4" /> : <Music2 aria-hidden="true" className="size-4" />}
              </div>
              {entry.kind === "folder" ? (
                <button className="min-w-0 flex-1 truncate text-start text-sm font-medium outline-none hover:underline focus-visible:underline" onClick={() => load(entry.path)} type="button">
                  {entry.name}
                </button>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground tabular-nums">{size(entry.sizeBytes)}</p>
                </div>
              )}
              {entry.sourceId && (
                <Button variant="ghost" size="icon-sm" onClick={() => redownload(entry)} aria-label={`Download ${entry.name} again`}>
                  <Download aria-hidden="true" />
                </Button>
              )}
              {canDelete && (
                <Button variant="ghost" size="icon-sm" onClick={() => remove(entry)} aria-label={`Delete ${entry.name}`}>
                  <Trash2 aria-hidden="true" className="text-destructive-foreground" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="rounded-2xl border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia><Folder aria-hidden="true" className="size-7 text-muted-foreground" /></EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>Downloads show up in this folder as they finish.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
