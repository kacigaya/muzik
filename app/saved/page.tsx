import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SavedMusic } from "@/components/saved-music";
import { publicNavidromeSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Saved music · Muzik", description: "Your liked YouTube Music songs and playlists." };

export default async function SavedPage() {
  const navidrome = await publicNavidromeSettings();
  return <div className="flex min-h-dvh flex-col"><SiteNav navidromeUrl={navidrome.url} /><main id="main-content" tabIndex={-1} className="flex-1"><SavedMusic /></main></div>;
}
