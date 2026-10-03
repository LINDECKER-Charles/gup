/**
 * Id of the section currently crossing the upper third of the viewport, for
 * the header's `aria-current="location"`. `null` on the server and on the
 * first client render, so the prerendered markup and hydration agree.
 *
 * @param {readonly string[]} ids  Must be referentially stable (module constant).
 * @returns {string | null}
 */
import { useEffect, useState } from "react";

const BAND = "-30% 0px -60% 0px";

export function useScrollspy(ids) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        setActive(ids.find((id) => visible.get(id)) ?? null);
      },
      { rootMargin: BAND },
    );
    for (const id of ids) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
