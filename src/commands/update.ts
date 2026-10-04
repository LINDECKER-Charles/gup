import chalk from "chalk";
import type { Command } from "commander";
import { localized } from "../core/i18n/localized.js";
import { isSupportedOn } from "../core/platform/is-supported-on.js";
import {
  resolveUpdateTarget,
  UPDATE_TARGET_LABELS,
  type InvalidUpdateTarget,
} from "../core/platform/update-target.js";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { Provider, ProviderScanResult, SelectedPackage } from "../core/types.js";
import { setInstallTimeoutSeconds } from "../core/runner.js";
import { requestsFrom } from "../core/update/update-plan.js";
import { runUpdates } from "../core/update/update-pipeline.js";
import type { UpdateRequest } from "../core/update/update-ports.js";
import { exitCodeOf, type UpdateReport } from "../core/update/update-report.js";
import { confirm } from "../ui/prompts/confirm.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { promptPackageSelection } from "../ui/select.js";
import { renderScanTable } from "../ui/table.js";
import { ERROR_LABELS } from "../ui/text/cli-labels.js";
import { counted } from "../ui/text/format.js";
import { beginSkipSession } from "../ui/skip-controller.js";
import { consolePorts, printReport } from "../ui/update-console.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";
import { warnIgnoredProviders } from "./warn-ignored-providers.js";

/** The command's own words: its help, its question and its messages. */
const UPDATE_LABELS = localized({
  en: {
    /** The usage's operands, after the command's name. */
    targets: "[targets...]",
    description: "Direct update (no menu). Targets in provider:packageId format.",
    all: "Update everything",
    yes: "Skip the confirmation in --all mode",
    provider: "Limit to some providers",
    fast: "Skip the slow scans",
    seconds: "<seconds>",
    timeout: "Timeout per install, in seconds — a stuck install is skipped (0 = off)",
    badTimeout: "--timeout expects a number of seconds >= 0",
    noSelection: "Nothing selected.",
    confirmAll: (count: number) => `${counted(count, "package", "packages")} to update. Continue?`,
    providerName: (typed: string) => `"${typed}" is a provider name, not a package id.`,
    tryProvider: "For this provider, try:",
    interactiveMenu: "interactive menu",
    examples: "Examples:",
    wholeProvider: "To update a whole provider without targeting a package:",
  },
  fr: {
    targets: "[cibles...]",
    description: "Mise à jour directe (sans menu). Cibles au format provider:packageId.",
    all: "Tout mettre à jour",
    yes: "Skip la confirmation en mode --all",
    provider: "Restreint à certains providers",
    fast: "Skip les scans lents",
    seconds: "<secondes>",
    timeout: "Timeout par install en secondes — l'install bloquée est skippée (0 = désactivé)",
    badTimeout: "--timeout attend un nombre de secondes >= 0",
    noSelection: "Aucune sélection.",
    confirmAll: (count) => `${count} paquets à mettre à jour. Continuer ?`,
    providerName: (typed) => `"${typed}" est un nom de provider, pas un identifiant de paquet.`,
    tryProvider: "Pour ce provider, essaie :",
    interactiveMenu: "menu interactif",
    examples: "Exemples :",
    wholeProvider: "Pour mettre à jour tout un provider sans cibler un paquet :",
  },
});

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

  warnIgnoredProviders(options.only);
  const { results: scans } = await scanWithProgress({
    ...(options.only && { only: options.only }),
    ...(options.fast !== undefined && { fast: options.fast }),
  });

  const allPackages: SelectedPackage[] = scans.flatMap((scan) =>
    scan.packages.map((pkg) => ({ providerId: scan.providerId, pkg })),
  );

  if (allPackages.length === 0) {
    // "à jour" — or the errors of the providers that could not scan.
    process.stdout.write(`${renderScanTable(scans)}\n`);
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
      process.stdout.write(`${UPDATE_LABELS.noSelection}\n`);
      return { kind: "empty" };
    }
    return { kind: "selection", packages };
  }

  if (!options.yes) {
    const ok = await confirm({
      message: UPDATE_LABELS.confirmAll(allPackages.length),
      default: true,
    });
    if (!ok) return { kind: "declined" };
  }
  return { kind: "selection", packages: allPackages };
}

/**
 * Validate every `provider:packageId` up front, before opening a skip session:
 * a typo must not leave a session dangling behind it. Returns null after
 * writing the diagnostic to stderr. The elevated child applies the same check.
 */
function resolveTargets(targets: string[]): UpdateRequest[] | null {
  const requests: UpdateRequest[] = [];
  for (const target of targets) {
    const resolved = resolveUpdateTarget(target);
    if (!resolved.isValid) {
      process.stderr.write(badTargetMessage(target, resolved));
      return null;
    }
    requests.push({ providerId: resolved.provider.id, packageId: resolved.packageId });
  }
  return requests;
}

/** A target with no provider gets examples; the others, the check's own reason. */
function badTargetMessage(target: string, { problem, error }: InvalidUpdateTarget): string {
  if (problem !== "format") return `${error}\n`;
  // Only suggest providers that can act here: never `gup list --provider winget` on a Mac.
  return formatBadTargetMessage(target, ALL_PROVIDERS.filter((p) => isSupportedOn(p)));
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

/** `updateOnConsole`, as an exit code: 1 when anything failed. */
async function runWithConsole(
  requests: readonly UpdateRequest[],
  opts: { yes?: boolean } = {},
): Promise<number> {
  return exitCodeOf(await updateOnConsole(requests, opts));
}

/**
 * Run updates on the plain terminal: a Ctrl+C skip session as the gate, the
 * console prompts for elevation and retries (none with `yes`), the summary
 * at the end. Shared by `gup update` and the menu's outside updates.
 */
export async function updateOnConsole(
  requests: readonly UpdateRequest[],
  opts: { yes?: boolean } = {},
): Promise<UpdateReport> {
  const session = beginSkipSession();
  try {
    const report = await runUpdates(requests, consolePorts({ gate: session, ...yesFlag(opts) }));
    printReport(report);
    return report;
  } finally {
    session.dispose();
  }
}

/**
 * Build the actionable error message shown when a user passes a positional
 * argument to `gup update` without the `provider:packageId` separator.
 *
 * Pure / testable: the provider list is injected so the function can be
 * exercised without spinning the registry up. Starts with the target check's
 * own format error — in French the historical "Format invalide: ..." prefix,
 * which existing assertions and downstream tooling grep for.
 */
export function formatBadTargetMessage(
  target: string,
  providers: readonly Pick<Provider, "id" | "displayName">[],
): string {
  // The historical prefix, verbatim ("Attendu provider:packageId" with no
  // trailing period), so downstream greps / external tools that
  // pattern-match this line keep working.
  const head = UPDATE_TARGET_LABELS.invalidFormat(target);
  const trimmed = target.trim();
  const key = trimmed.toLowerCase();
  // Case-insensitive on both id AND displayName: id resolution should not
  // silently differ from display-name resolution.
  const hint =
    providers.find((p) => p.id.toLowerCase() === key) ??
    providers.find((p) => p.displayName.toLowerCase() === key);

  const body = hint ? providerNameHint(trimmed, hint.id) : genericTargetExamples();
  return [head, ...body].join("\n") + "\n";
}

/** The user typed a provider name: show them the commands that do work. */
function providerNameHint(typed: string, providerId: string): string[] {
  return [
    UPDATE_LABELS.providerName(typed),
    UPDATE_LABELS.tryProvider,
    `  gup list --provider ${providerId}`,
    `  gup update --provider ${providerId} --all`,
    `  gup                            # ${UPDATE_LABELS.interactiveMenu}`,
  ];
}

/** The commands aligned under the end of the "Examples:" label, whatever its length. */
function genericTargetExamples(): string[] {
  const label = `${UPDATE_LABELS.examples} `;
  const indent = " ".repeat(label.length);
  return [
    `${label}gup update winget:Microsoft.VisualStudioCode`,
    `${indent}gup update npm-g:typescript`,
    UPDATE_LABELS.wholeProvider,
    `${indent}gup update --provider <id> --all`,
  ];
}

interface UpdateFlags {
  all?: boolean;
  yes?: boolean;
  provider?: string[];
  fast?: boolean;
  timeout?: string;
}

export const updateModule: CliModule = {
  id: "update",
  order: MODULE_ORDER.commands,
  register(program: Command) {
    // Names and flags stay literals ahead of their localized placeholders:
    // the landing reads gup's commands and flags from these declarations
    // (index/tests/rules/cli-citations.test.mjs).
    program
      .command("update")
      .argument(UPDATE_LABELS.targets)
      .description(UPDATE_LABELS.description)
      .option("-a, --all", UPDATE_LABELS.all)
      .option("-y, --yes", UPDATE_LABELS.yes)
      .option("-p, --provider <ids...>", UPDATE_LABELS.provider)
      .option("--fast", UPDATE_LABELS.fast)
      .option("--timeout " + UPDATE_LABELS.seconds, UPDATE_LABELS.timeout)
      .action(async (targets: string[], opts: UpdateFlags) => {
        applyTimeoutFlag(opts.timeout);
        const code = await updateCommand({
          ...(targets.length > 0 && { targets }),
          ...(opts.all !== undefined && { all: opts.all }),
          ...(opts.yes !== undefined && { yes: opts.yes }),
          ...(opts.provider && { only: opts.provider }),
          ...(opts.fast !== undefined && { fast: opts.fast }),
        });
        process.exit(code);
      });
  },
};

/** `--timeout <seconds>` wins over GUP_INSTALL_TIMEOUT; a bad value exits 2. */
function applyTimeoutFlag(raw: string | undefined): void {
  if (raw === undefined) return;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    process.stderr.write(`${chalk.red(ERROR_LABELS.prefix)} ${UPDATE_LABELS.badTimeout}\n`);
    process.exit(2);
  }
  setInstallTimeoutSeconds(seconds);
}
