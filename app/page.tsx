import { MuzikApp } from "@/components/muzik-app";
import { Onboarding } from "@/components/onboarding";
import { musicDir, publicLidarrSettings, publicNavidromeSettings } from "@/lib/settings";
import { defaultFormat } from "@/lib/validation";

export default async function Page() {
  if (!(await musicDir())) {
    return <Onboarding suggestion={process.env.MUZIK_DEFAULT_MUSIC_DIR ?? ""} />;
  }
  const [navidrome, lidarr] = await Promise.all([publicNavidromeSettings(), publicLidarrSettings()]);
  const lidarrEnabled = lidarr.enabled && Boolean(lidarr.url) && lidarr.apiKeyConfigured;
  return <MuzikApp navidromeUrl={navidrome.url} lidarrEnabled={lidarrEnabled} defaultFormat={defaultFormat()} />;
}
