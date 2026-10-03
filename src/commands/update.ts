import chalk from "chalk";
import { isSupportedOn } from "../core/platform/is-supported-on.js";
import { lookupProvider } from "../core/platform/lookup-provider.js";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { Provider, ProviderScanResult, SelectedPackage } from "../core/types.js";
import { requestsFrom } from "../core/update/update-plan.js";
import { runUpdates } from "../core/update/update-pipeline.js";
import type { UpdateRequest } from "../core/update/update-ports.js";
import { exitCodeOf } from "../core/update/update-report.js";
import { confirm } from "../ui/prompts/confirm.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { promptPackageSelection } from "../ui/select.js";
import { beginSkipSession } from "../ui/skip-controller.js";
import { consolePorts, printReport } from "../ui/update-console.js";

export interface UpdateOptions {
  only?: string[];
  fast?: boolean;
  all?: boolean;
  yes?: boolean;
  targets?: string[];
}

/** `{ yes }` only when the flag was passed, so a default is never overwritten. */
function yesFlag(options: { yes?: boolean }): { yes?: boolean } {
  return { ...(options.yes !== undefined && { yes: options.yes }) };
}

export async function updateCommand(options: UpdateOptions): Promise<number> {
  if (options.targets?.length) {
    return runTargets(options.targets, yesFlag(options));
  }

  const { results: scans } = await scanWithProgress({
    ...(options.only && { only: options.only }),
    ...(options.fast !== undefined && { fast: options.fast }),
  });

  const allPackages: SelectedPackage[] = scans.flatMap((scan) =>
    scan.packages.map((pkg) => ({ providerId: scan.providerId, pkg })),
  );

  if (allPackages.length === 0) {
    process.stdout.write(`${chalk.green("à jour — aucune mise à jour disponible")}\n`);
    return 0;
  }

  const chosen = await chooseSelection(allPackages, scans, options);
  if (chosen.kind === "declined") return 1;
  if (chosen.kind === "empty") return 0;
  return runSelection(chosen.packages, yesFlag(options));
}

type SelectionResult =
  | { kind: "selection"; packages: SelectedPackage[] }
  | { kind: "declined" }
  | { kind: "empty" };

/**
 * `--all` takes everything (subject to confirmation), otherwise the
 * interactive picker opens. The two "nothing to do" outcomes stay distinct:
 * a declined confirmation exits 1, an empty selection exits 0.
 */
async function chooseSelection(
  allPackages: SelectedPackage[],
  scans: ProviderScanResult[],
  options: UpdateOptions,
): Promise<SelectionResult> {
  if (!options.all) {
    const packages = await promptPackageSelection(scans);
    if (packages.length === 0) {
      process.stdout.write("Aucune sélection.\n");
      return { kind: "empty" };
    }
    return { kind: "selection", packages };
  }

  if (!options.yes) {
    const ok = await confirm({
      message: `${allPackages.length} paquets à mettre à jour. Continuer ?`,
      default: true,
    });
    if (!ok) return { kind: "declined" };
  }
  return { kind: "selection", packages: allPackages };
}

/**
 * Validate every `provider:packageId` up front, before opening a skip session:
 * a typo must not leave a session dangling behind it. Returns null after
 * writing the diagnostic to stderr.
 */
function resolveTargets(targets: string[]): UpdateRequest[] | null {
  const requests: UpdateRequest[] = [];
  for (const target of targets) {
    const idx = target.indexOf(":");
    if (idx === -1) {
      // Only suggest providers that can act here: never
      // `gup list --provider winget` on a Mac.
      const actionable = ALL_PROVIDERS.filter((p) => isSupportedOn(p));
      process.stderr.write(formatBadTargetMessage(target, actionable));
      return null;
    }
    const providerId = target.slice(0, idx);
    const lookup = lookupProvider(providerId);
    if (!lookup.isFound) {
      process.stderr.write(`${lookup.error}\n`);
      return null;
    }
    requests.push({ providerId, packageId: target.slice(idx + 1) });
  }
  return requests;
}

async function runTargets(targets: string[], opts: { yes?: boolean } = {}): Promise<number> {
  const requests = resolveTargets(targets);
  if (!requests) return 2;
  return runWithConsole(requests, opts);
}

function runSelection(
  selection: SelectedPackage[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  return runWithConsole(requestsFrom(selection), opts);
}

/**
 * Run updates on the plain terminal: a Ctrl+C skip session as the gate, the
 * console prompts for elevation and retries (none with `yes`), the summary
 * at the end. Returns the exit code: 1 when anything failed.
 */
export async function runWithConsole(
  requests: readonly UpdateRequest[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  const session = beginSkipSession();
  try {
    const report = await runUpdates(requests, consolePorts({ gate: session, ...yesFlag(opts) }));
    printReport(report);
    return exitCodeOf(report);
  } finally {
    session.dispose();
  }
}

/**
 * Build the actionable error message shown when a user passes a positional
 * argument to `gup update` without the `provider:packageId` separator.
 *
 * Pure / testable: the provider list is injected so the function can be
 * exercised without spinning the registry up. Preserves the historical
 * "Format invalide: ..." prefix to avoid breaking existing assertions and
 * downstream tooling that greps for it.
 */
export function formatBadTargetMessage(
  target: string,
  providers: readonly Pick<Provider, "id" | "displayName">[],
): string {
  // Preserve the historical prefix verbatim ("Attendu provider:packageId"
  // with no trailing period) so downstream greps / external tools that
  // pattern-match this line keep working.
  const head = `Format invalide: "${target}". Attendu provider:packageId`;
  const trimmed = target.trim();
  const key = trimmed.toLowerCase();
  // Case-insensitive on both id AND displayName: id resolution should not
  // silently differ from display-name resolution.
  const hint =
    providers.find((p) => p.id.toLowerCase() === key) ??
    providers.find((p) => p.displayName.toLowerCase() === key);

  const body = hint ? providerNameHint(trimmed, hint.id) : GENERIC_TARGET_EXAMPLES;
  return [head, ...body].join("\n") + "\n";
}

/** The user typed a provider name: show them the commands that do work. */
function providerNameHint(typed: string, providerId: string): string[] {
  return [
    `"${typed}" est un nom de provider, pas un identifiant de paquet.`,
    `Pour ce provider, essaie :`,
    `  gup list --provider ${providerId}`,
    `  gup update --provider ${providerId} --all`,
    `  gup                            # menu interactif`,
  ];
}

const GENERIC_TARGET_EXAMPLES = [
  `Exemples : gup update winget:Microsoft.VisualStudioCode`,
  `           gup update npm-global:typescript`,
  `Pour mettre à jour tout un provider sans cibler un paquet :`,
  `           gup update --provider <id> --all`,
];
