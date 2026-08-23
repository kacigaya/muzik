import { MuzikApp } from "@/components/muzik-app";
import { Onboarding } from "@/components/onboarding";
import { musicDir, publicNavidromeSettings } from "@/lib/settings";

export default async function Page() {
  if (!(await musicDir())) {
    return <Onboarding suggestion={process.env.MUZIK_DEFAULT_MUSIC_DIR ?? ""} />;
  }
  const navidrome = await publicNavidromeSettings();
  return <MuzikApp navidromeUrl={navidrome.url} />;
}
