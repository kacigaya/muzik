import { SiteNav } from "@/components/site-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl="" />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
          <h1 className="mb-8 font-heading text-xl font-semibold">Settings</h1>
          <div className="mb-8">
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-10 rounded-lg" key={index} />
              ))}
            </div>
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
