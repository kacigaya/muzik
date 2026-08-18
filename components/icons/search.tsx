"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SearchIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/** From lucide-animated.com, trimmed the same way as {@link ./disc-3.tsx}. */
export function SearchIcon({
  className,
  onMouseEnter,
  onMouseLeave,
  ref,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { ref?: React.Ref<SearchIconHandle> }) {
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
      <motion.svg
        animate={controls}
        aria-hidden="true"
        className="size-4.5 opacity-80 sm:size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        transition={{ duration: 1 }}
        variants={{ normal: { x: 0, y: 0 }, animate: { x: [0, 0, -3, 0], y: [0, -4, 0, 0] } }}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </motion.svg>
    </span>
  );
}
