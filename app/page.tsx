import { MuzikApp } from "@/components/muzik-app";
import { musicDir, publicLidarrSettings, publicNavidromeSettings } from "@/lib/settings";
import { defaultFormat } from "@/lib/validation";

export default async function Page() {
  const [navidrome, lidarr] = await Promise.all([publicNavidromeSettings(), publicLidarrSettings()]);
  const lidarrEnabled = lidarr.enabled && Boolean(lidarr.url) && lidarr.apiKeyConfigured;
  const downloadsConfigured = Boolean(await musicDir());
  return <MuzikApp downloadsConfigured={downloadsConfigured} navidromeUrl={navidrome.url} lidarrEnabled={lidarrEnabled} defaultFormat={defaultFormat()} />;
}
