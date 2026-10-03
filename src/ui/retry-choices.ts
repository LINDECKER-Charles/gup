import type { PlannedUpdate, RetryStrategyId } from "../core/update/update-ports.js";
import type { DialogChoice } from "./tui/dialog.js";

/**
 * How a retry question reads, wherever it is asked (the console prompt, a
 * dialog in the run view): the "leave it" answer first, then the tiers still
 * available with what each one risks.
 */

export type RetryAnswer = RetryStrategyId | "none";

const NO_RETRY: DialogChoice<RetryAnswer> = { label: "Aucun — laisser les échecs", value: "none" };

const TIER_CHOICES: Readonly<Record<RetryStrategyId, DialogChoice<RetryAnswer>>> = {
  force: {
    value: "force",
    label: "--force (bypass vérification SHA — sûr)",
    description:
      "Réessaie l'install en ignorant le hash. Utile sur mismatch de hash. " +
      "N'aide pas si winget dit « aucune mise à niveau applicable ».",
  },
  "force-uninstall": {
    value: "force-uninstall",
    label: "--force --uninstall-previous (désinstalle puis réinstalle — destructif)",
    description:
      "Désinstalle d'abord la version actuelle, puis installe la nouvelle. " +
      "Nécessaire quand la techno d'install change. " +
      "Risque: config app non stockée dans %APPDATA% peut être perdue.",
  },
  reinstall: {
    value: "reinstall",
    label: "uninstall + install (deux commandes séparées — dernier recours)",
    description:
      "Exécute `winget uninstall` puis `winget install --force` en deux étapes. " +
      "Contourne les cas où `--uninstall-previous` ne se déclenche pas " +
      "(version courante inconnue, « aucune mise à niveau applicable »). Même risque destructif.",
  },
};

export const RETRY_QUESTION = "Stratégie de réessai";

export function retryChoices(available: readonly RetryStrategyId[]): DialogChoice<RetryAnswer>[] {
  return [NO_RETRY, ...available.map((id) => TIER_CHOICES[id])];
}

/** "2 échec(s) récupérable(s) (Winget: 2) — typiquement …" */
export function describeRetryables(failures: readonly PlannedUpdate[]): string {
  const perProvider = new Map<string, number>();
  for (const { providerName } of failures) {
    perProvider.set(providerName, (perProvider.get(providerName) ?? 0) + 1);
  }
  const summary = [...perProvider].map(([name, count]) => `${name}: ${count}`).join(", ");
  return (
    `${failures.length} échec(s) récupérable(s) (${summary}) — typiquement hash ` +
    `d'installeur, manifest locale, ou changement de technologie d'installation.`
  );
}
