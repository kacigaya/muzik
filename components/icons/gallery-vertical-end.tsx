"use client";

import { motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps, Variants } from "motion/react";
import { cn } from "@/lib/utils";

/** The two stacked sheets drop in one after the other, the topmost one last. */
const SHEET: Variants = {
  normal: { translateY: 0, opacity: 1 },
  animate: (index: number) => ({
    translateY: [2 * index, 0],
    opacity: [0, 1],
    transition: { delay: 0.25 * (2 - index), duration: 0.3 },
  }),
};

/** From lucide-animated.com, trimmed the same way as {@link ./settings.tsx}. */
export function GalleryVerticalEndIcon({
  className,
  onMouseEnter,
  onMouseLeave,
  ...props
}: HTMLMotionProps<"span">) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      animate="normal"
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileHover={reducedMotion ? undefined : "animate"}
      {...props}
    >
      <motion.svg
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
        <motion.path custom={1} d="M7 2h10" variants={SHEET} />
        <motion.path custom={2} d="M5 6h14" variants={SHEET} />
        <rect height="12" rx="2" width="18" x="3" y="10" />
      </motion.svg>
    </motion.span>
  );
}
