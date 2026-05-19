// Custom hooks — pure logic, no JSX, reusable across components.
import { useState, useEffect, useRef, useCallback } from "react";

// Drives a frame-by-frame terminal replay.
// Returns { frame, isLastFrame, replay } — UI decides what to render.
export function useTerminalAnimation(frames) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setFrame(0);
    setPlaying(true);
  }, [frames]);

  // Clamp during render — the reset useEffect above only fires after commit,
  // so a frames change leaves frame momentarily pointing past the new array.
  const idx = Math.min(frame, frames.length - 1);

  useEffect(() => {
    if (!playing) return;
    if (idx >= frames.length - 1) return;
    const f = frames[idx];
    timeoutRef.current = setTimeout(() => setFrame((x) => x + 1), f.delay ?? 400);
    return () => clearTimeout(timeoutRef.current);
  }, [idx, playing, frames]);

  const replay = useCallback(() => {
    setFrame(0);
    setPlaying(true);
  }, []);

  return {
    frame: idx,
    lines: frames[idx].lines,
    isLastFrame: idx >= frames.length - 1,
    replay,
  };
}

// Wraps navigator.clipboard with a copied-flag that auto-resets.
export function useClipboard(resetMs = 1400) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    (text) => {
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      });
    },
    [resetMs],
  );
  return { copied, copy };
}
