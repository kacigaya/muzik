import { Music2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Artwork({ src, className, icon: Icon = Music2, eager = false }: { src: string | null | undefined; className?: string; icon?: LucideIcon; eager?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground", className)}>
      {src ? (
        // Provider artwork hosts vary; native lazy loading avoids an unsafe wildcard image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <Icon aria-hidden="true" className="size-2/5" />
      )}
    </span>
  );
}
