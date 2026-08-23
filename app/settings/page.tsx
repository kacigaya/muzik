import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings-panel";
import { SiteNav } from "@/components/site-nav";
import { musicDir, pinnedByEnvironment, publicNavidromeSettings } from "@/lib/settings";

export default async function SettingsPage() {
  const library = await musicDir();
  if (!library) redirect("/");
  const navidrome = await publicNavidromeSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl={navidrome.url} />
      <main className="flex-1">
        <SettingsPanel musicDir={library} pinned={pinnedByEnvironment()} navidrome={navidrome} />
      </main>
    </div>
  );
}
