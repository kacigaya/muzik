import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings-panel";
import { musicDir, pinnedByEnvironment, publicNavidromeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const library = await musicDir();
  if (!library) redirect("/");
  return <SettingsPanel musicDir={library} pinned={pinnedByEnvironment()} navidrome={await publicNavidromeSettings()} />;
}
