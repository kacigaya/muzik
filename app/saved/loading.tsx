import { SiteNav } from "@/components/site-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="flex min-h-dvh flex-col"><SiteNav navidromeUrl="" /><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-8"><h1 className="text-2xl font-semibold">Saved music</h1><Skeleton className="mt-6 h-40 w-full" /></main></div>;
}
