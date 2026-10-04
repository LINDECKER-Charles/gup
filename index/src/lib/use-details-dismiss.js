/**
 * Menu behaviour for a native <details> disclosure: Escape closes it and puts
 * focus back on its <summary>; a pointer press outside closes it. Without
 * JavaScript the <details> still opens, closes and navigates on its own.
 *
 * @param {{ current: HTMLDetailsElement | null }} ref
 */
import { useEffect } from "react";

export function useDetailsDismiss(ref) {
  useEffect(() => {
    const details = ref.current;
    if (!details) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== "Escape" || !details.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    const onPointerDown = (event) => {
      if (details.open && !details.contains(event.target)) details.open = false;
    };

    details.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      details.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [ref]);
}
