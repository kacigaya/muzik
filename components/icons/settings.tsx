"use client";

import { motion, useReducedMotion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * From lucide-animated.com, trimmed to what this app uses: the wrapper stretches to its
 * container so hovering anywhere in an icon button runs the animation, and the glyph stays
 * still when the visitor asked for reduced motion.
 */
export function SettingsIcon({ className, onMouseEnter, onMouseLeave, ...props }: HTMLMotionProps<"span">) {
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
        transition={{ type: "spring", stiffness: 50, damping: 10 }}
        variants={{ normal: { rotate: 0 }, animate: { rotate: 180 } }}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </motion.svg>
    </motion.span>
  );
}
