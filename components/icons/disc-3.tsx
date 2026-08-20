"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import type { HTMLAttributes } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface Disc3IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/**
 * From lucide-animated.com, trimmed the same way as {@link ./settings.tsx}. Buttons that
 * carry a label are wider than the glyph, so they drive the animation through the handle.
 */
export function Disc3Icon({
  className,
  onMouseEnter,
  onMouseLeave,
  ref,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { ref?: React.Ref<Disc3IconHandle> }) {
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
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="2" />
        <motion.g
          animate={controls}
          style={{ transformOrigin: "12px 12px" }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          variants={{ normal: { rotate: 0 }, animate: { rotate: 90 } }}
        >
          <path d="M6 12c0-1.7.7-3.2 1.8-4.2" />
          <path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />
        </motion.g>
      </svg>
    </span>
  );
}
