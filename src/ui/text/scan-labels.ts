import { localized } from "../../core/i18n/localized.js";
import { counted } from "./format.js";

/**
 * The Scan view's words, in the interface's languages: the live progress of
 * a scan, then its result per provider — in the menu, and on the one-shot
 * scan screen of `gup list` and `gup update`. Tests import them rather than
 * repeat them.
 */
export const SCAN_LABELS = localized({
  en: {
    runningHints: "scanning…",
    idleHints: "r rescan · ↑↓ scroll",
    /** The one-shot scan screen's only key. */
    screenHints: "Ctrl+C interrupt",
    detecting: "detecting providers…",
    interrupted: (reason: string) => `Scan interrupted: ${reason}`,
    finished: (duration: string) => `Scan finished in ${duration}`,
    /** After `finished`: "27 providers, 12 updates". */
    totals: (providers: number, updates: number) =>
      `${counted(providers, "provider", "providers")}, ${counted(updates, "update", "updates")}`,
    /** A provider's row while it is being scanned. */
    running: "running…",
    updates: (count: number) => counted(count, "update", "updates"),
    upToDate: "up to date",
  },
  fr: {
    runningHints: "scan en cours…",
    idleHints: "r rescanner · ↑↓ défiler",
    screenHints: "Ctrl+C interrompre",
    detecting: "détection des providers…",
    interrupted: (reason) => `Scan interrompu : ${reason}`,
    finished: (duration) => `Scan terminé en ${duration}`,
    totals: (providers, updates) => `${providers} provider(s), ${updates} mise(s) à jour`,
    running: "en cours…",
    updates: (count) => `${count} mise(s) à jour`,
    upToDate: "à jour",
  },
});
