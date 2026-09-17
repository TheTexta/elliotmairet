"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const dots = [" .", " .", " ."];
const dotDelayMs = 1000;

export function AnimatedFooterText({ children }: { children: string }) {
  const reduceMotion = useReducedMotion();
  const textRef = useRef<HTMLParagraphElement>(null);
  const isInView = useInView(textRef, { amount: 0.8, once: true });
  const [visibleDotCount, setVisibleDotCount] = useState(0);
  const displayDotCount = reduceMotion ? dots.length : visibleDotCount;

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    if (!isInView || visibleDotCount >= dots.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisibleDotCount((count) => Math.min(count + 1, dots.length));
    }, visibleDotCount === 0 ? 0 : dotDelayMs);

    return () => window.clearTimeout(timeout);
  }, [isInView, reduceMotion, visibleDotCount]);

  return (
    <p className="whitespace-pre-wrap" ref={textRef}>
      {children}
      <span aria-hidden="true">{dots.slice(0, displayDotCount).join("")}</span>
      <span className="sr-only">...</span>
    </p>
  );
}