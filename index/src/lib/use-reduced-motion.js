/**
 * Single source of truth for "should this page animate".
 *
 * Read in the state initialiser, not in an effect: reading it late meant the
 * first client render claimed motion was fine, so the reveal layer hid content
 * one tick before learning it should not have. This is hydration-safe because
 * every consumer renders the same markup for both values on its first render
 * (complete terminal scene, visible sections) — only effects differ.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [isReduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isReduced;
}
