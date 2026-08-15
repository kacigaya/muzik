import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateMusicDir } from "./validation.ts";

type NavidromeAuthMode = "apiKey" | "password";
type StoredNavidromeSettings = {
  url: string;
  authMode: NavidromeAuthMode;
  apiKey: string;
  username: string;
  password: string;
};
export type Settings = { musicDir: string; navidrome?: StoredNavidromeSettings };
export type PublicNavidromeSettings = {
  url: string;
  authMode: NavidromeAuthMode;
  username: string;
  apiKeyConfigured: boolean;
  passwordConfigured: boolean;
  urlPinned: boolean;
  authPinned: boolean;
};

const globalSettings = globalThis as typeof globalThis & { muzikSettingsSaveChain?: Promise<void> };

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
    if (typeof parsed.musicDir !== "string") return null;
    const candidate = parsed.navidrome as Partial<StoredNavidromeSettings> | undefined;
    const navidrome = candidate
      && typeof candidate.url === "string"
      && (candidate.authMode === "apiKey" || candidate.authMode === "password")
      && typeof candidate.apiKey === "string"
      && typeof candidate.username === "string"
      && typeof candidate.password === "string"
      ? candidate as StoredNavidromeSettings
      : undefined;
    return {
      musicDir: parsed.musicDir,
      ...(navidrome && { navidrome }),
    };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return null;
  }
}

async function save(settings: Settings) {
  await mkdir(dataDir(), { recursive: true });
  const temporary = `${settingsFile()}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(settings, null, 2), { mode: 0o600 });
    await rename(temporary, settingsFile());
  } finally {
    await rm(temporary, { force: true });
  }
}

function serializeSave<T>(operation: () => Promise<T>) {
  const run = (globalSettings.muzikSettingsSaveChain ?? Promise.resolve()).then(operation, operation);
  globalSettings.muzikSettingsSaveChain = run.then(() => undefined, () => undefined);
  return run;
}

function cleanNavidromeUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("Navidrome URL is required.");
  const candidate = value.trim();
  if (!candidate) throw new Error("Navidrome URL is required.");
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error("Navidrome URL is invalid."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Navidrome URL must be an HTTP or HTTPS address without credentials, query, or fragment.");
  }
  return url.href.replace(/\/$/, "");
}

function cleanSecret(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  if (value.length > 4096) throw new Error(`${label} is too long.`);
  return value;
}

function cleanUsername(value: unknown) {
  if (typeof value !== "string") throw new Error("Navidrome username is invalid.");
  const username = value.trim();
  if (!username || username.length > 200 || /[\u0000-\u001f\u007f]/.test(username)) {
    throw new Error("Navidrome username is invalid.");
  }
  return username;
}

/**
 * NAVIDROME_URL never passes through the settings form, so it is validated on read. An
 * unparseable or non-HTTP value counts as unset, which keeps it out of hrefs and outbound
 * requests and leaves the operator able to configure a server through the UI.
 */
function environmentNavidromeUrl() {
  const candidate = process.env.NAVIDROME_URL?.trim();
  if (!candidate) return "";
  try {
    return cleanNavidromeUrl(candidate);
  } catch {
    return "";
  }
}

export async function navidromeConnection() {
  const stored = (await load())?.navidrome;
  return {
    url: environmentNavidromeUrl() || stored?.url || "",
    apiKey: process.env.MUZIK_NAVIDROME_API_KEY || stored?.apiKey || "",
    username: process.env.MUZIK_NAVIDROME_USERNAME || stored?.username || "",
    password: process.env.MUZIK_NAVIDROME_PASSWORD || stored?.password || "",
  };
}

export async function publicNavidromeSettings(): Promise<PublicNavidromeSettings> {
  const stored = (await load())?.navidrome;
  const connection = await navidromeConnection();
  const environmentApiKey = Boolean(process.env.MUZIK_NAVIDROME_API_KEY);
  const environmentPassword = Boolean(
    process.env.MUZIK_NAVIDROME_USERNAME && process.env.MUZIK_NAVIDROME_PASSWORD,
  );
  return {
    url: connection.url,
    authMode: environmentApiKey ? "apiKey" : environmentPassword ? "password" : stored?.authMode ?? "apiKey",
    username: connection.username,
    apiKeyConfigured: Boolean(connection.apiKey),
    passwordConfigured: Boolean(connection.password),
    urlPinned: Boolean(environmentNavidromeUrl()),
    authPinned: environmentApiKey || environmentPassword,
  };
}

export async function saveNavidromeSettings(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Navidrome settings are invalid.");
  return serializeSave(async () => {
    const input = value as Record<string, unknown>;
    const settings = await load() ?? { musicDir: fromEnvironment() };
    if (!settings.musicDir) throw new Error("Choose a music folder before configuring Navidrome.");
    const current = settings.navidrome;
    const urlPinned = Boolean(environmentNavidromeUrl());
    const authPinned = Boolean(process.env.MUZIK_NAVIDROME_API_KEY
      || (process.env.MUZIK_NAVIDROME_USERNAME && process.env.MUZIK_NAVIDROME_PASSWORD));
    const url = urlPinned ? current?.url ?? "" : cleanNavidromeUrl(input.url);
    if (authPinned && !urlPinned && url !== (current?.url ?? "")) {
      throw new Error("Set NAVIDROME_URL with environment-managed credentials.");
    }
    const effectiveUrl = environmentNavidromeUrl() || url;
    const urlChanged = Boolean(current && url !== current.url);
    const authMode = input.authMode === "password" ? "password" : "apiKey";
    let apiKey = current?.apiKey ?? "";
    let username = current?.username ?? "";
    let password = current?.password ?? "";
    if (!authPinned && input.clearAuth === true) {
      apiKey = "";
      username = "";
      password = "";
    } else if (!authPinned && authMode === "apiKey") {
      const supplied = cleanSecret(input.apiKey, "Navidrome API key");
      apiKey = supplied || (!urlChanged && current?.authMode === "apiKey" ? apiKey : "");
      if (effectiveUrl && !apiKey && !process.env.MUZIK_NAVIDROME_CONTAINER) throw new Error("Navidrome API key is required.");
      username = "";
      password = "";
    } else if (!authPinned) {
      username = cleanUsername(input.username);
      const supplied = cleanSecret(input.password, "Navidrome password");
      password = supplied || (!urlChanged && current?.authMode === "password" ? password : "");
      if (effectiveUrl && !password) throw new Error("Navidrome password is required.");
      apiKey = "";
    }
    settings.navidrome = { url, authMode, apiKey, username, password };
    await save(settings);
    return publicNavidromeSettings();
  });
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
  return serializeSave(async () => {
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
    await save({ musicDir: chosen });
    return chosen;
  });
}
