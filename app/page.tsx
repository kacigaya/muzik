import { MuzikApp } from "@/components/muzik-app";
import { Onboarding } from "@/components/onboarding";
import { musicDir } from "@/lib/settings";

// Read at request time so a prebuilt image can be pointed at any library.
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await musicDir())) {
    return <Onboarding suggestion={process.env.MUZIK_DEFAULT_MUSIC_DIR ?? ""} />;
  }
  return <MuzikApp navidromeUrl={process.env.NAVIDROME_URL ?? ""} />;
}
