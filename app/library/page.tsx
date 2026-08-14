import { redirect } from "next/navigation";
import { LibraryBrowser } from "@/components/library-browser";
import { musicDir } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!(await musicDir())) redirect("/");
  return <LibraryBrowser />;
}
