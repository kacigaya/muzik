import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="px-3 pt-4 sm:px-5" role="status" aria-label="Loading">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="mt-10 h-5 w-40" />
      <div className="mt-3 grid grid-cols-2 gap-4 @xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-square w-full rounded-lg" />)}
      </div>
    </div>
  );
}
