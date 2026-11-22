import { DURATION_MS } from "../../time-units.js";

const SECONDS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const SECONDS_PER_MINUTE = DURATION_MS.minute / DURATION_MS.second;

/** `850 ms`, `8,1 s`, `3 min 12 s`: what a run or an update took. */
export function formatDuration(ms: number): string {
  if (ms < DURATION_MS.second) return `${Math.round(ms)} ms`;
  if (ms < DURATION_MS.minute) return `${SECONDS.format(ms / DURATION_MS.second)} s`;
  const totalSeconds = Math.round(ms / DURATION_MS.second);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}
