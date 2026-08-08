import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { getProvider } from "../core/registry.js";
import { applyUpdate } from "./apply-update.js";
import { isAbortRequested } from "./skip-controller.js";
import type { UpdateOptions, UpdateOutcome } from "../core/types.js";

export interface OutcomeWithProvider {
  providerId: string;
  outcome: UpdateOutcome;
}

type RetryStrategy = "none" | "force" | "force-uninstall" | "reinstall";

interface StrategySpec {
  value: RetryStrategy;
  name: string;
  description: string;
  options: UpdateOptions;
  label: string;
}

const STRATEGIES: StrategySpec[] = [
  {
    value: "force",
    name: "--force (bypass vérification SHA — sûr)",
    description:
      "Réessaie l'install en ignorant le hash. Utile sur mismatch de hash. N'aide pas si winget dit « aucune mise à niveau applicable ».",
    options: { force: true },
    label: "retry --force",
  },
  {
    value: "force-uninstall",
    name: "--force --uninstall-previous (désinstalle puis réinstalle — destructif)",
    description:
      "Désinstalle d'abord la version actuelle, puis installe la nouvelle. Nécessaire quand la techno d'install change. Risque: config app non stockée dans %APPDATA% peut être perdue.",
    options: { force: true, uninstallPrevious: true },
    label: "retry --force --uninstall-previous",
  },
  {
    value: "reinstall",
    name: "uninstall + install (deux commandes séparées — dernier recours)",
    description:
      "Exécute `winget uninstall` puis `winget install --force` en deux étapes. Contourne les cas où `--uninstall-previous` ne se déclenche pas (version courante inconnue, « aucune mise à niveau applicable »). Même risque destructif.",
    options: { force: true, reinstall: true },
    label: "retry uninstall + install",
  },
];

/**
 * Post-batch hook: when at least one provider flagged a failure as
 * `retryable`, prompt the user to pick a retry strategy. Recurses until
 * either all retryable failures are resolved or every strategy has been
 * tried (or the user picks "none"). Strategies are presented in
 * progressively more aggressive order; once a tier has been attempted it is
 * removed from the next prompt so the user moves forward rather than
 * looping on a strategy that already failed.
 *
 * Skipped silently in non-interactive mode (`yes=true`) — explicit opt-in
 * is required for any hash-bypass or uninstall behavior.
 */
export async function maybeRetryFailures(
  entries: OutcomeWithProvider[],
  opts: { yes?: boolean; excludeStrategies?: RetryStrategy[] } = {},
): Promise<UpdateOutcome[]> {
  const flat = entries.map((e) => e.outcome);
  if (opts.yes) return flat;

  const retryByProvider = groupRetryables(entries);
  if (retryByProvider.size === 0) return flat;

  const excluded = new Set(opts.excludeStrategies ?? []);
  const remaining = STRATEGIES.filter((s) => !excluded.has(s.value));
  if (remaining.length === 0) return flat;

  announceRetryables(retryByProvider);
  const spec = await promptStrategy(remaining);
  if (!spec) return flat;

  const retried = await retryAll(retryByProvider, spec);
  const nextEntries: OutcomeWithProvider[] = entries.map((e) => {
    const r = retried.get(`${e.providerId}:${e.outcome.id}`);
    return r ? { providerId: e.providerId, outcome: r } : e;
  });

  return maybeRetryFailures(nextEntries, {
    ...opts,
    excludeStrategies: [...excluded, spec.value],
  });
}

/** Ids of the failures flagged `retryable`, grouped by provider. */
function groupRetryables(
  entries: OutcomeWithProvider[],
): Map<string, string[]> {
  const byProvider = new Map<string, string[]>();
  for (const e of entries) {
    const { success, skipped, retryable, id } = e.outcome;
    if (success || skipped || retryable !== true) continue;
    const list = byProvider.get(e.providerId) ?? [];
    list.push(id);
    byProvider.set(e.providerId, list);
  }
  return byProvider;
}

function announceRetryables(retryByProvider: Map<string, string[]>): void {
  const summary = Array.from(retryByProvider.entries())
    .map(([pid, ids]) => `${getProvider(pid)?.displayName ?? pid}: ${ids.length}`)
    .join(", ");
  const total = Array.from(retryByProvider.values()).reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
  process.stdout.write(
    chalk.dim(
      `\n  ${total} échec(s) récupérable(s) (${summary}) — typiquement hash ` +
        `d'installeur, manifest locale, ou changement de technologie ` +
        `d'installation.\n`,
    ),
  );
}

/** The strategy the user picked, or null when they decline. */
async function promptStrategy(
  remaining: typeof STRATEGIES,
): Promise<(typeof STRATEGIES)[number] | null> {
  const strategy = await select<RetryStrategy>({
    message: "Stratégie de réessai",
    default: "none",
    choices: [
      { name: "Aucun — laisser les échecs", value: "none" },
      ...remaining.map((s) => ({
        name: s.name,
        value: s.value,
        description: s.description,
      })),
    ],
    loop: false,
  });
  if (strategy === "none") return null;
  return STRATEGIES.find((s) => s.value === strategy) ?? null;
}

/** Replay every retryable failure, keyed on `providerId:packageId`. */
async function retryAll(
  retryByProvider: Map<string, string[]>,
  spec: (typeof STRATEGIES)[number],
): Promise<Map<string, UpdateOutcome>> {
  const retried = new Map<string, UpdateOutcome>();
  for (const [providerId, ids] of retryByProvider) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    const head = chalk.bold(`  ↻ ${provider.displayName} (${spec.label})`);
    process.stdout.write(`\n${head} ${chalk.dim(`(${ids.length})`)}\n`);
    for (const id of ids) {
      if (isAbortRequested()) break;
      retried.set(
        `${providerId}:${id}`,
        await applyUpdate(provider, id, {
          update: spec.options,
          retry: spec.label,
        }),
      );
    }
  }
  return retried;
}
