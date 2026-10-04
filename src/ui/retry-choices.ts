import { localized } from "../core/i18n/localized.js";
import type { PlannedUpdate, RetryStrategyId } from "../core/update/update-ports.js";
import { counted } from "./text/format.js";
import type { DialogChoice } from "./tui/dialog.js";

/**
 * How a retry question reads, wherever it is asked (the console prompt, a
 * dialog in the run view): the "leave it" answer first, then the tiers still
 * available with what each one risks.
 */

export type RetryAnswer = RetryStrategyId | "none";

/** A tier as the question lists it: what it runs, then what it does and risks. */
interface TierWords {
  readonly label: string;
  readonly description: string;
}

export const RETRY_LABELS = localized({
  en: {
    question: "Retry strategy",
    none: "None — leave the failures",
    tiers: {
      force: {
        label: "--force (bypass the SHA check — safe)",
        description:
          "Retries the install ignoring the hash. Useful on a hash mismatch. " +
          'Does not help when winget says "No applicable upgrade found".',
      },
      "force-uninstall": {
        label: "--force --uninstall-previous (uninstall then reinstall — destructive)",
        description:
          "Uninstalls the current version first, then installs the new one. " +
          "Needed when the installer technology changes. " +
          "Risk: app settings not stored in %APPDATA% may be lost.",
      },
      reinstall: {
        label: "uninstall + install (two separate commands — last resort)",
        description:
          "Runs `winget uninstall` then `winget install --force` as two steps. " +
          "Works around the cases where `--uninstall-previous` does not kick in " +
          '(unknown current version, "No applicable upgrade found"). Same destructive risk.',
      },
    } as Readonly<Record<RetryStrategyId, TierWords>>,
    /** "2 recoverable failures (Winget: 2) — typically …" */
    retryables: (count: number, perProvider: string) =>
      `${counted(count, "recoverable failure", "recoverable failures")} (${perProvider}) — ` +
      "typically an installer hash, a locale manifest, or a change of installer technology.",
  },
  fr: {
    question: "Stratégie de réessai",
    none: "Aucun — laisser les échecs",
    tiers: {
      force: {
        label: "--force (bypass vérification SHA — sûr)",
        description:
          "Réessaie l'install en ignorant le hash. Utile sur mismatch de hash. " +
          "N'aide pas si winget dit « aucune mise à niveau applicable ».",
      },
      "force-uninstall": {
        label: "--force --uninstall-previous (désinstalle puis réinstalle — destructif)",
        description:
          "Désinstalle d'abord la version actuelle, puis installe la nouvelle. " +
          "Nécessaire quand la techno d'install change. " +
          "Risque: config app non stockée dans %APPDATA% peut être perdue.",
      },
      reinstall: {
        label: "uninstall + install (deux commandes séparées — dernier recours)",
        description:
          "Exécute `winget uninstall` puis `winget install --force` en deux étapes. " +
          "Contourne les cas où `--uninstall-previous` ne se déclenche pas " +
          "(version courante inconnue, « aucune mise à niveau applicable »). " +
          "Même risque destructif.",
      },
    },
    retryables: (count, perProvider) =>
      `${count} échec(s) récupérable(s) (${perProvider}) — typiquement hash ` +
      `d'installeur, manifest locale, ou changement de technologie d'installation.`,
  },
});

/** "None" first, then the tiers still `available`, worded in the active language. */
export function retryChoices(available: readonly RetryStrategyId[]): DialogChoice<RetryAnswer>[] {
  const none: DialogChoice<RetryAnswer> = { label: RETRY_LABELS.none, value: "none" };
  return [none, ...available.map((id) => ({ value: id, ...RETRY_LABELS.tiers[id] }))];
}

/** "2 recoverable failures (Winget: 2) — typically …" */
export function describeRetryables(failures: readonly PlannedUpdate[]): string {
  const perProvider = new Map<string, number>();
  for (const { providerName } of failures) {
    perProvider.set(providerName, (perProvider.get(providerName) ?? 0) + 1);
  }
  const summary = [...perProvider].map(([name, count]) => `${name}: ${count}`).join(", ");
  return RETRY_LABELS.retryables(failures.length, summary);
}
