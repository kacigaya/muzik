import { createHash, randomBytes } from "node:crypto";
import { navidromeConnection } from "./settings.ts";

type SubsonicResponse = {
  "subsonic-response"?: {
    status?: string;
    error?: { message?: string };
  };
};

export function navidromeScanUrl(baseUrl: string, apiKey: string, username: string, password: string, salt: string) {
  const url = new URL("rest/startScan.view", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("v", "1.16.1");
  url.searchParams.set("c", "muzik");
  url.searchParams.set("f", "json");
  url.searchParams.set("fullScan", "false");
  if (apiKey) {
    url.searchParams.set("apiKey", apiKey);
  } else {
    url.searchParams.set("u", username);
    url.searchParams.set("s", salt);
    url.searchParams.set("t", createHash("md5").update(password + salt, "utf8").digest("hex"));
  }
  return url;
}

/** Starts a quick scan through Navidrome's OpenSubsonic API. Returns false when unconfigured. */
export async function startNavidromeScan() {
  const { url: baseUrl, apiKey, username, password } = await navidromeConnection();
  if (!baseUrl || (!apiKey && (!username || !password))) return false;

  const salt = randomBytes(8).toString("hex");
  const response = await fetch(navidromeScanUrl(baseUrl, apiKey, username, password, salt), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Navidrome scan request failed with HTTP ${response.status}.`);
  const body = await response.json() as SubsonicResponse;
  const result = body["subsonic-response"];
  if (result?.status !== "ok") throw new Error(result?.error?.message ?? "Navidrome rejected the scan request.");
  return true;
}
