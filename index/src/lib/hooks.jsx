/**
 * Client-side hooks. All of them are SSR-safe: nothing touches `window`
 * outside an effect, and every one renders its final, complete state on the
 * server so the prerendered HTML is what a crawler sees.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Single source of truth for "should this page animate".
 *
 * The media query is read in the state initialiser, not in an effect. Reading
 * it in an effect meant the first render always claimed motion was fine, so the
 * ambient layer armed the scroll-reveal (opacity: 0) one tick before learning
 * it should not have — and its cleanup could not un-hide what it had hidden.
 * A reader with reduced motion got a blank page.
 *
 * Reading it synchronously is hydration-safe here because every consumer
 * renders the SAME markup for both values on its first render: the counters
 * show their final number, the terminal shows the complete scene, the
 * architecture stage shows the finished diagram. Only the effects differ.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Reveals a scene one line at a time.
 *
 * Starts on the LAST frame rather than the first: that way the server renders
 * the whole scene (real terminal output in the crawler-visible HTML) and
 * hydration matches, and the replay only rewinds once the client is live. With
 * reduced motion the scene simply stays complete.
 */
export function useSceneReveal(lines, { stepMs = 95 } = {}) {
  const reduced = usePrefersReducedMotion();
  const total = lines.length;
  const [shown, setShown] = useState(total);
  const [animating, setAnimating] = useState(false);

  // Rewind and replay whenever the scene changes — but only once the client
  // has taken over, so the first paint keeps the server's complete output.
  useEffect(() => {
    if (reduced) {
      setShown(total);
      setAnimating(false);
      return;
    }
    setShown(0);
    setAnimating(true);
  }, [lines, total, reduced]);

  useEffect(() => {
    if (!animating || shown >= total) return;
    const id = setTimeout(() => setShown((n) => n + 1), stepMs);
    return () => clearTimeout(id);
  }, [animating, shown, total, stepMs]);

  const replay = useCallback(() => {
    setShown(0);
    setAnimating(true);
  }, []);

  return { visible: lines.slice(0, shown), done: shown >= total, replay };
}

/** navigator.clipboard with a self-resetting confirmation flag. */
export function useClipboard(resetMs = 1800) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    (text) => {
      // No await: the flag is optimistic, and a rejected write (insecure
      // context, denied permission) leaves the command visible next to the
      // button anyway.
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy };
}

/**
 * True once the element has entered the viewport, and stays true. Used by the
 * counters; renders `false` on the server, which is why anything using it must
 * render its final value as the fallback.
 */
export function useInView(ref, { rootMargin = "-10% 0px -10% 0px" } = {}) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref, rootMargin, seen]);

  return seen;
}
