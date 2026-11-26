import { Onboarding } from "@/components/onboarding";
import { SettingsPanel } from "@/components/settings-panel";
import { lyricsSettings, musicDir, pinnedByEnvironment, publicLidarrSettings, publicNavidromeSettings } from "@/lib/settings";
import { defaultFormat } from "@/lib/validation";

export default async function SettingsPage() {
  const library = await musicDir();
  if (!library) return <Onboarding suggestion={process.env.MUZIK_DEFAULT_MUSIC_DIR ?? ""} />;
  const [navidrome, lyrics, lidarr] = await Promise.all([publicNavidromeSettings(), lyricsSettings(), publicLidarrSettings()]);
  return (
    <SettingsPanel
      musicDir={library}
      pinned={pinnedByEnvironment()}
      navidrome={navidrome}
      lyrics={lyrics}
      lidarr={lidarr}
      defaultFormat={defaultFormat()}
    />
  );
}
