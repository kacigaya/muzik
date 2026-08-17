"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * From lucide-animated.com, trimmed to what this app uses: the wrapper stretches to its
 * container so hovering anywhere in an icon button runs the animation, and the bars stay
 * still when the visitor asked for reduced motion.
 */
export function AudioLinesIcon({ className, onMouseEnter, onMouseLeave, ...props }: HTMLAttributes<HTMLSpanElement>) {
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
        <path d="M2 10v3" />
        <motion.path
          animate={controls}
          d="M6 6v11"
          variants={{
            normal: { d: "M6 6v11" },
            animate: { d: ["M6 6v11", "M6 10v3", "M6 6v11"], transition: { duration: 1.5, repeat: Infinity } },
          }}
        />
        <motion.path
          animate={controls}
          d="M10 3v18"
          variants={{
            normal: { d: "M10 3v18" },
            animate: { d: ["M10 3v18", "M10 9v5", "M10 3v18"], transition: { duration: 1, repeat: Infinity } },
          }}
        />
        <motion.path
          animate={controls}
          d="M14 8v7"
          variants={{
            normal: { d: "M14 8v7" },
            animate: { d: ["M14 8v7", "M14 6v11", "M14 8v7"], transition: { duration: 0.8, repeat: Infinity } },
          }}
        />
        <motion.path
          animate={controls}
          d="M18 5v13"
          variants={{
            normal: { d: "M18 5v13" },
            animate: { d: ["M18 5v13", "M18 7v9", "M18 5v13"], transition: { duration: 1.5, repeat: Infinity } },
          }}
        />
        <path d="M22 10v3" />
      </svg>
    </span>
  );
}
