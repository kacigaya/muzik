import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jobStore } from "./jobs.ts";
import { musicDir } from "./settings.ts";
import type { Subscription } from "./types.ts";

const HOUR_MS = 60 * 60 * 1000;

function dataDir() {
  return process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data";
}

function file() {
  return join(dataDir(), "subscriptions.json");
}

export function isDue(subscription: Subscription, at = Date.now()) {
  if (!subscription.lastCheckedAt) return true;
  return at - Date.parse(subscription.lastCheckedAt) >= subscription.intervalHours * HOUR_MS;
}

async function read(): Promise<Subscription[]> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8"));
    return Array.isArray(parsed) ? parsed as Subscription[] : [];
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return [];
  }
}

// Follow, unfollow, and the scheduler all rewrite the same file, so writes are queued
// behind one another instead of racing.
let writeChain = Promise.resolve();

async function write(subscriptions: Subscription[]) {
  writeChain = writeChain.then(async () => {
    await mkdir(dataDir(), { recursive: true });
    const temporary = `${file()}.tmp`;
    await writeFile(temporary, JSON.stringify(subscriptions, null, 2), { mode: 0o600 });
    await rename(temporary, file());
  });
  await writeChain;
}

export async function listSubscriptions() {
  return read();
}

export async function addSubscription(request: Omit<Subscription, "id" | "createdAt" | "lastCheckedAt" | "lastJobId">) {
  const subscriptions = await read();
  const existing = subscriptions.find((entry) => entry.kind === request.kind && entry.sourceId === request.sourceId);
  if (existing) return { subscription: existing, created: false };
  const subscription: Subscription = {
    ...request,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastJobId: null,
  };
  subscriptions.unshift(subscription);
  await write(subscriptions);
  return { subscription, created: true };
}

export async function removeSubscription(id: string) {
  const subscriptions = await read();
  const remaining = subscriptions.filter((entry) => entry.id !== id);
  if (remaining.length === subscriptions.length) throw new Error("Subscription not found.");
  await write(remaining);
  return remaining;
}

/**
 * Re-queues each due collection. yt-dlp's download archive already skips everything that
 * was fetched before, so a sync job only pulls tracks added since the last run.
 */
export async function syncDue(at = Date.now()) {
  if (!(await musicDir())) return [];
  const subscriptions = await read();
  const synced: Subscription[] = [];
  for (const subscription of subscriptions) {
    if (!isDue(subscription, at)) continue;
    try {
      const { job } = await jobStore.create({
        kind: subscription.kind,
        sourceId: subscription.sourceId,
        url: null,
        title: subscription.title,
        subtitle: subscription.subtitle,
        artist: null,
        album: subscription.kind === "album" ? subscription.title : null,
        thumbnail: subscription.thumbnail,
        durationSeconds: null,
        trackNumber: null,
        format: subscription.format,
      });
      subscription.lastJobId = job.id;
      subscription.lastCheckedAt = new Date(at).toISOString();
      synced.push(subscription);
    } catch { /* a failing sync retries on the next tick */ }
  }
  if (synced.length) await write(subscriptions);
  return synced;
}

let timer: NodeJS.Timeout | null = null;

/** Started once from instrumentation.ts, so a long-running server checks on its own. */
export function startScheduler(intervalMs = 15 * 60 * 1000) {
  if (timer) return timer;
  timer = setInterval(() => { void syncDue(); }, intervalMs);
  timer.unref();
  return timer;
}
