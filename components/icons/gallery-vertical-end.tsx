import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** From lucide-animated.com, trimmed the same way as {@link ./settings.tsx}. The two stacked sheets drop in one after the other, the topmost one last. */
export function GalleryVerticalEndIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("group/icon inline-flex items-center justify-center", className)} {...props}>
      <svg
        aria-hidden="true"
        className="size-4.5 opacity-80 sm:size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path className="[--sheet-offset:2px] motion-safe:group-hover/icon:animate-sheet-in motion-safe:group-hover/icon:[animation-delay:250ms]" d="M7 2h10" />
        <path className="[--sheet-offset:4px] motion-safe:group-hover/icon:animate-sheet-in" d="M5 6h14" />
        <rect height="12" rx="2" width="18" x="3" y="10" />
      </svg>
    </span>
  );
}
