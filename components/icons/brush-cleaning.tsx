"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface BrushCleaningIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/**
 * From lucide-animated.com, trimmed the same way as {@link ./disc-3.tsx}. Icon-only buttons are
 * padded wider than the glyph, so hover is driven through the handle.
 */
export function BrushCleaningIcon({
  className,
  onMouseEnter,
  onMouseLeave,
  ref,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { ref?: React.Ref<BrushCleaningIconHandle> }) {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();
  const controlled = useRef(false);

  const start = useCallback(() => {
    if (!reducedMotion) controls.start("animate");
  }, [controls, reducedMotion]);

  useImperativeHandle(ref, () => {
    controlled.current = true;
    return { startAnimation: start, stopAnimation: () => controls.start("normal") };
  }, [controls, start]);

  // Stops a running animation if the visitor turns reduced motion on while hovering.
  useEffect(() => {
    if (reducedMotion) controls.start("normal");
  }, [controls, reducedMotion]);

  const handleMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!controlled.current) start();
      onMouseEnter?.(event);
    },
    [onMouseEnter, start],
  );

  const handleMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (!controlled.current) controls.start("normal");
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
        {/* Handle and head sweep together; the pivot sits at the top of the handle. */}
        <motion.g
          animate={controls}
          style={{ transformOrigin: "12px 4px" }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          variants={{ normal: { rotate: 0 }, animate: { rotate: [0, -12, 12, 0] } }}
        >
          <path d="M19 13.99a1 1 0 0 0 1-1V12a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v.99a1 1 0 0 0 1 1" />
          <path d="M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z" />
          {/* Bristles trail the sweep. */}
          <motion.path
            d="m8 22 1-4"
            transition={{ duration: 0.7, ease: "easeInOut", delay: 0.05 }}
            variants={{ normal: { x: 0 }, animate: { x: [0, -1.5, 1.5, 0] } }}
          />
          <motion.path
            d="m16 22-1-4"
            transition={{ duration: 0.7, ease: "easeInOut", delay: 0.05 }}
            variants={{ normal: { x: 0 }, animate: { x: [0, -1.5, 1.5, 0] } }}
          />
        </motion.g>
      </svg>
    </span>
  );
}
