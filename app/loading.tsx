import { Music2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl="" logoHref="#top" />
      <main className="flex-1 px-4 py-14 sm:py-20" id="top">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <Music2 aria-hidden="true" className="mb-4 size-8 text-muted-foreground" />
          <Skeleton className="h-12 w-full max-w-xl rounded-xl sm:h-14" />
          <Skeleton className="mt-4 h-5 w-full max-w-md" />
          <Skeleton className="mt-8 h-12 w-full max-w-xl rounded-xl" />
        </div>
      </main>
    </div>
  );
}
