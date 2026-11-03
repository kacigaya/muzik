import { Onboarding } from "@/components/onboarding";
import { SettingsPanel } from "@/components/settings-panel";
import { SiteNav } from "@/components/site-nav";
import { lyricsSettings, musicDir, pinnedByEnvironment, publicLidarrSettings, publicNavidromeSettings } from "@/lib/settings";
import { defaultFormat } from "@/lib/validation";

export default async function SettingsPage() {
  const library = await musicDir();
  if (!library) return <><SiteNav navidromeUrl="" /><main id="main-content" tabIndex={-1}><Onboarding suggestion={process.env.MUZIK_DEFAULT_MUSIC_DIR ?? ""} /></main></>;
  const [navidrome, lyrics, lidarr] = await Promise.all([publicNavidromeSettings(), lyricsSettings(), publicLidarrSettings()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl={navidrome.url} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <SettingsPanel
          musicDir={library}
          pinned={pinnedByEnvironment()}
          navidrome={navidrome}
          lyrics={lyrics}
          lidarr={lidarr}
          defaultFormat={defaultFormat()}
        />
      </main>
    </div>
  );
}
