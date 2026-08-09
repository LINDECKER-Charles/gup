/**
 * Ambient motion: scroll-reveal, parallax, the camera tilt on the big panels,
 * the pointer spotlight, the per-card glow, the progress bar and the sticky
 * install bar.
 *
 * These effects only ever write inline styles and data-* attributes onto
 * elements whose content React does not re-render, so imperative DOM writes
 * are safe here — and far cheaper than pushing a scroll position through
 * React state on every frame. Anything that changes *text* (the beat
 * narration, the counters) is React state instead: see sections/Architecture
 * and ui/Counter.
 *
 * Everything is opt-in per element through a data attribute, and the whole
 * layer is skipped under `prefers-reduced-motion` — which is also why the
 * reveal styles live behind `[data-reveal-armed]` rather than applying by
 * default: with no JS, or with reduced motion, the content is simply visible.
 */
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./hooks.jsx";

/** Coalesces every listener into one rAF per frame. */
function rafThrottle(fn) {
  let queued = 0;
  const run = () => {
    queued = 0;
    fn();
  };
  return () => {
    if (queued) return;
    queued = requestAnimationFrame(run);
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const all = (selector) => Array.from(document.querySelectorAll(selector));

/**
 * Arms scroll-reveal only on elements that are still below the fold. Content
 * already on screen at load stays painted: hiding it to fade it back in costs
 * a frame of flicker and buys nothing, and it would put the LCP element behind
 * an IntersectionObserver callback.
 */
function armReveals() {
  const pending = all("[data-reveal]").filter(
    (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
  );
  pending.forEach((el) => el.setAttribute("data-reveal-armed", "1"));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        // Stagger siblings in groups of four so a grid arrives as a wave
        // rather than all at once.
        const order = Number(el.getAttribute("data-reveal")) || 0;
        el.style.transitionDelay = `${Math.min(order % 4, 3) * 80}ms`;
        el.setAttribute("data-reveal-shown", "1");
        io.unobserve(el);
      });
    },
    { rootMargin: "-6% 0px -6% 0px" },
  );
  pending.forEach((el) => io.observe(el));

  return () => {
    io.disconnect();
    // Un-hide anything still armed. Without this, a teardown before the
    // observer fired — StrictMode's double-invoke in dev, or the motion
    // preference flipping mid-session — would leave content at opacity 0 with
    // nothing left to reveal it.
    pending
      .filter((el) => !el.hasAttribute("data-reveal-shown"))
      .forEach((el) => el.removeAttribute("data-reveal-armed"));
  };
}

/** Drives the top progress bar and the sticky install bar. */
function bindChrome() {
  const bar = document.querySelector("[data-progress]");
  const sticky = document.querySelector("[data-sticky-cta]");

  return () => {
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    const progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (sticky) {
      // Appears once the hero is behind you, hides again over the install
      // section so it never covers its own call to action.
      const show = window.scrollY > vh * 0.85 && progress < 0.97;
      sticky.setAttribute("data-shown", show ? "1" : "0");
    }
  };
}

/** Depth: translate on scroll, and a slight rotateX as a panel crosses the
 *  centre of the viewport. */
function bindDepth() {
  const layers = all("[data-parallax]");
  const cams = all("[data-cam]");

  return () => {
    const vh = window.innerHeight;
    layers.forEach((el) => {
      const factor = Number(el.getAttribute("data-parallax"));
      el.style.transform = `translate3d(0, ${window.scrollY * factor}px, 0)`;
    });
    cams.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const offset = clamp((rect.top + rect.height / 2 - vh / 2) / vh, -1, 1);
      el.style.transform =
        `perspective(1400px) rotateX(${(offset * 2.6).toFixed(2)}deg)` +
        ` scale(${(1 - Math.abs(offset) * 0.03).toFixed(3)})`;
    });
  };
}

/**
 * Pointer spotlight plus the per-card glow. Card rects are cached and only
 * re-measured on scroll/resize — reading them inside the pointermove handler
 * would force a layout on every mouse event.
 */
function bindPointer() {
  const spot = document.querySelector("[data-spotlight]");
  const cards = all("[data-tilt]");
  let rects = [];
  const measure = () => {
    rects = cards.map((el) => el.getBoundingClientRect());
  };
  measure();

  let x = 0;
  let y = 0;
  const paint = rafThrottle(() => {
    if (spot) {
      spot.style.setProperty("--spot-x", `${x}px`);
      spot.style.setProperty("--spot-y", `${y}px`);
      spot.setAttribute("data-spot-active", "1");
    }
    cards.forEach((el, i) => {
      const r = rects[i];
      if (!r) return;
      const near =
        x >= r.left - 40 && x <= r.right + 40 && y >= r.top - 40 && y <= r.bottom + 40;
      el.setAttribute("data-tilt-active", near ? "1" : "0");
      if (!near) return;
      el.style.setProperty("--tilt-x", `${x - r.left}px`);
      el.style.setProperty("--tilt-y", `${y - r.top}px`);
    });
  });

  const onMove = (event) => {
    x = event.clientX;
    y = event.clientY;
    paint();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  return {
    measure,
    dispose: () => window.removeEventListener("pointermove", onMove),
  };
}

export function useAmbientMotion() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;

    const disposeReveals = armReveals();
    const chrome = bindChrome();
    const depth = bindDepth();
    const pointer = bindPointer();

    const onScroll = rafThrottle(() => {
      chrome();
      depth();
    });
    const onResize = rafThrottle(() => {
      chrome();
      depth();
      pointer.measure();
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    onScroll();

    return () => {
      disposeReveals();
      pointer.dispose();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);
}

/**
 * Progress of an element through a sticky scroll stage, as 0→1 — or `null`
 * when there is no scroll to read: during SSR, on the first client render, and
 * permanently under `prefers-reduced-motion`.
 *
 * `null` is a distinct third state on purpose. It lets the caller render the
 * stage COMPLETE rather than empty, so the prerendered HTML a crawler reads
 * carries the finished diagram, and a reader who asked for less motion gets
 * the whole thing at once instead of a blank panel that never fills.
 */
export function useStageProgress(ref) {
  const reduced = usePrefersReducedMotion();
  const [scrolled, setScrolled] = useState(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return undefined;

    // Whether the stage hijacks scroll is decided by the stylesheet, not
    // duplicated here: below its breakpoint the panel is laid out statically and
    // `--stage-interactive` flips to 0. Reading the flag keeps the breakpoint in
    // one place, and re-reading it on resize handles a window crossing it.
    let interactive = false;
    const measure = () => {
      interactive =
        getComputedStyle(node).getPropertyValue("--stage-interactive").trim() === "1";
    };

    const update = rafThrottle(() => {
      const rect = interactive ? node.getBoundingClientRect() : null;
      const span = rect ? rect.height - window.innerHeight : 0;
      setScrolled(span > 0 ? clamp(-rect.top / span, 0, 1) : null);
    });
    const onResize = () => {
      measure();
      update();
    };

    measure();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
    };
  }, [ref, reduced]);

  return reduced ? null : scrolled;
}
