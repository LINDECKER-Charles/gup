/**
 * Below-the-fold fade-up for `[data-reveal]` elements.
 *
 * Only elements still below 92 % of the viewport at load are armed: content
 * already on screen (the H1, the LCP element) is never hidden to be faded back
 * in. Nothing is armed without JavaScript or under reduced motion, so the
 * prerendered page is always fully visible. The `data-reveal` value staggers
 * siblings in groups of four.
 */
import { useEffect } from "react";
import { useReducedMotion } from "./use-reduced-motion.js";

const FOLD = 0.92;
const STAGGER_MS = 80;
const GROUP = 4;

function reveal(entries, observer) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const order = Number(entry.target.getAttribute("data-reveal")) || 0;
    entry.target.style.transitionDelay = `${(order % GROUP) * STAGGER_MS}ms`;
    entry.target.setAttribute("data-reveal-shown", "1");
    observer.unobserve(entry.target);
  }
}

function armReveals() {
  const pending = [...document.querySelectorAll("[data-reveal]")].filter(
    (element) => element.getBoundingClientRect().top > window.innerHeight * FOLD,
  );
  const observer = new IntersectionObserver(reveal, { rootMargin: "0px 0px -6% 0px" });
  for (const element of pending) {
    element.setAttribute("data-reveal-armed", "1");
    observer.observe(element);
  }
  return () => {
    observer.disconnect();
    // Un-hide whatever is still armed: a teardown before the observer fired
    // (StrictMode's double effect, the motion preference flipping) must not
    // leave content at opacity 0 with nothing left to reveal it.
    for (const element of pending) element.removeAttribute("data-reveal-armed");
  };
}

export function useReveal() {
  const isReduced = useReducedMotion();
  useEffect(() => (isReduced ? undefined : armReveals()), [isReduced]);
}
