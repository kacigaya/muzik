import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { JobStore } from "../lib/jobs.ts";
import { addSubscription } from "../lib/subscriptions.ts";

const ENV_NAMES = ["MUZIK_DATA_DIR", "MUZIK_TEMP_DIR"];

function job(id, status, createdAt) {
  return {
    id, kind: "song", sourceId: "dQw4w9WgXcQ", url: null, title: id, subtitle: "s", format: "m4a",
    status, progress: 0, createdAt, updatedAt: createdAt,
  };
}

/** A store over a fresh data dir, seeded with `jobs` as jobs.json. */
async function storeWith(t, jobs) {
  const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const dataDir = await mkdtemp(join(tmpdir(), "muzik-store-data-"));
  process.env.MUZIK_DATA_DIR = dataDir;
  process.env.MUZIK_TEMP_DIR = await mkdtemp(join(tmpdir(), "muzik-store-tmp-"));
  await writeFile(join(dataDir, "jobs.json"), JSON.stringify(jobs));
  return { store: new JobStore(), dataDir };
}

test("concurrent first requests read the queue from disk once", async (t) => {
  const { store } = await storeWith(t, [job("11111111-1111-1111-1111-111111111111", "completed", "2026-01-01T00:00:00.000Z")]);
  let persisted = 0;
  store.subscribe(() => { persisted += 1; });
  const [first, second] = await Promise.all([store.list(), store.list()]);
  assert.equal(persisted, 1);
  assert.equal(first[0], second[0]);
});

test("a failed write does not block every later write", async (t) => {
  const { store, dataDir } = await storeWith(t, []);
  await store.list();
  await mkdir(join(dataDir, "jobs.json.tmp"));
  await assert.rejects(() => store.clearFinished(), { code: "EISDIR" });
  await rmdir(join(dataDir, "jobs.json.tmp"));
  await store.clearFinished();

  await mkdir(join(dataDir, "subscriptions.json.tmp"));
  const request = { kind: "playlist", sourceId: "PLabcdefghij", title: "Mix", subtitle: "Me", thumbnail: null, format: "m4a", intervalHours: 24 };
  await assert.rejects(() => addSubscription(request), { code: "EISDIR" });
  await rmdir(join(dataDir, "subscriptions.json.tmp"));
  assert.equal((await addSubscription(request)).created, true);
});

test("the worker downloads queued jobs oldest first", async (t) => {
  // jobs.json is newest first, the order create() writes it in.
  const { store } = await storeWith(t, [
    job("33333333-3333-3333-3333-333333333333", "queued", "2026-01-03T00:00:00.000Z"),
    job("22222222-2222-2222-2222-222222222222", "queued", "2026-01-02T00:00:00.000Z"),
    job("11111111-1111-1111-1111-111111111111", "queued", "2026-01-01T00:00:00.000Z"),
  ]);
  const order = [];
  store.download = async (queued) => {
    order.push(queued.id[0]);
    queued.status = "completed";
  };
  await store.list();
  for (let attempt = 0; attempt < 100 && order.length < 3; attempt += 1) await sleep(10);
  assert.deepEqual(order, ["1", "2", "3"]);
});
