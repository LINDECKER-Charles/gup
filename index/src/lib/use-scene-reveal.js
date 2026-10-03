/**
 * Replays a line scene one line at a time.
 *
 * Starts on the LAST frame: the server renders the whole scene (real output in
 * the crawler-visible HTML) and hydration matches; the replay only rewinds
 * once the client is live. Under reduced motion the scene stays complete.
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion.js";

const STEP_MS = 95;

/**
 * @template T
 * @param {readonly T[]} lines
 * @returns {readonly T[]} the lines revealed so far
 */
export function useSceneReveal(lines) {
  const isReduced = useReducedMotion();
  const total = lines.length;
  const [shown, setShown] = useState(total);
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    setShown(isReduced ? total : 0);
    setPlaying(!isReduced);
  }, [lines, total, isReduced]);

  useEffect(() => {
    if (!isPlaying || shown >= total) return undefined;
    const timer = setTimeout(() => setShown((count) => count + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, shown, total]);

  return lines.slice(0, shown);
}
