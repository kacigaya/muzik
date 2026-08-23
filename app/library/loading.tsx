import { SiteNav } from "@/components/site-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl="" />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
          <div className="mb-6 flex min-h-9 items-center justify-between gap-4">
            <h1 className="font-heading text-xl font-semibold">Library</h1>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-14 w-full rounded-xl" key={index} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
