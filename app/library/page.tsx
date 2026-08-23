import { redirect } from "next/navigation";
import { LibraryBrowser } from "@/components/library-browser";
import { SiteNav } from "@/components/site-nav";
import { musicDir, publicNavidromeSettings } from "@/lib/settings";

export default async function LibraryPage() {
  if (!(await musicDir())) redirect("/");
  const navidrome = await publicNavidromeSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl={navidrome.url} />
      <main className="flex-1">
        <LibraryBrowser />
      </main>
    </div>
  );
}
