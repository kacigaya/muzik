import { constants } from "node:fs";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateMusicDir } from "./validation.ts";

export type Settings = { musicDir: string };

function dataDir() {
  return process.env.MUZIK_DATA_DIR ?? "/srv/muzik/data";
}

function settingsFile() {
  return join(dataDir(), "settings.json");
}

function fromEnvironment() {
  return process.env.MUZIK_MUSIC_DIR?.trim() ?? "";
}

// Read on every call: pages and route handlers are separate server bundles, so a cached
// copy in one of them would not see a folder chosen through the other.
async function load(): Promise<Settings | null> {
  try {
    const parsed = JSON.parse(await readFile(settingsFile(), "utf8")) as Partial<Settings>;
    return typeof parsed.musicDir === "string" ? { musicDir: parsed.musicDir } : null;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return null;
  }
}

/**
 * The configured library root, or null while Muzik still needs onboarding. The stored
 * value is re-validated on every read because the environment and settings.json are both
 * edited by hand, and a bad root would widen what safeMusicPath accepts.
 */
export async function musicDir() {
  const candidate = fromEnvironment() || (await load())?.musicDir || "";
  if (!candidate) return null;
  try {
    return validateMusicDir(candidate);
  } catch {
    return null;
  }
}

/** MUZIK_MUSIC_DIR pins the library, so those deployments never see onboarding. */
export function pinnedByEnvironment() {
  return Boolean(fromEnvironment());
}

export async function saveMusicDir(value: unknown) {
  // Re-checked here, not only in the route, so no caller can retarget a live library.
  if (await musicDir()) throw new Error("A music folder is already configured.");
  const chosen = validateMusicDir(value);
  await mkdir(chosen, { recursive: true });
  const target = await stat(chosen);
  if (!target.isDirectory()) throw new Error("Music folder is not a directory.");
  try {
    await access(chosen, constants.W_OK);
  } catch {
    throw new Error("Music folder is not writable by Muzik.");
  }
  await mkdir(dataDir(), { recursive: true });
  const temporary = `${settingsFile()}.tmp`;
  await writeFile(temporary, JSON.stringify({ musicDir: chosen } satisfies Settings, null, 2), { mode: 0o600 });
  await rename(temporary, settingsFile());
  return chosen;
}
