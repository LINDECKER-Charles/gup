/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * Renders the final number on the server and on the first client render, so
 * the prerendered HTML — the version a crawler reads and the version shown
 * with JS disabled — always states the real figure. The count-up is a
 * progressive enhancement layered on top, and is skipped entirely under
 * `prefers-reduced-motion`.
 */
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion, useInView } from "../lib/hooks.jsx";

const DURATION_MS = 1500;
/** Ease-out cubic: fast start, settles on the number. */
const ease = (t) => 1 - Math.pow(1 - t, 3);

export function Counter({ value, suffix = "" }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (reduced || !inView || value === 0) return undefined;

    let frame = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setShown(Math.round(value * ease(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value]);

  return (
    <span ref={ref}>
      {shown ?? value}
      {suffix}
    </span>
  );
}
