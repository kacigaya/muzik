"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

/** From lucide-animated.com, trimmed the same way as {@link ./audio-lines.tsx}. */
export function SettingsIcon({ className, onMouseEnter, onMouseLeave, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();

  // Stops a running animation if the visitor turns reduced motion on while hovering.
  useEffect(() => {
    if (reducedMotion) controls.start("normal");
  }, [controls, reducedMotion]);

  const handleMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!reducedMotion) controls.start("animate");
      onMouseEnter?.(event);
    },
    [controls, onMouseEnter, reducedMotion],
  );

  const handleMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      controls.start("normal");
      onMouseLeave?.(event);
    },
    [controls, onMouseLeave],
  );

  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <motion.svg
        animate={controls}
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
    </span>
  );
}
