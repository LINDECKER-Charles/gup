/**
 * Clipboard write with a real outcome: "copied" only once the browser
 * accepted the write, "failed" when it refused (insecure context, denied
 * permission, no Clipboard API). Either state resets to "idle" after a pause.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const RESET_MS = 2000;

/** @returns {{ state: "idle" | "copied" | "failed", copy: (text: string) => Promise<void> }} */
export function useClipboard() {
  const [state, setState] = useState("idle");
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text) => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  }, []);

  return { state, copy };
}
