import chalk from "chalk";
import type { BatchHolder } from "../core/update/update-extensions.js";
import type {
  AbortGate,
  Attempt,
  PlannedUpdate,
  RetryRequest,
  RetryStrategyId,
  UpdateDecisions,
  UpdateObserver,
  UpdatePlan,
  UpdatePorts,
} from "../core/update/update-ports.js";
import { RETRY_TIERS } from "../core/update/retry-pass.js";
import type { UpdateReport } from "../core/update/update-report.js";
import type { UpdateOutcome } from "../core/types.js";
import { confirm } from "./prompts/confirm.js";
import { select } from "./prompts/select.js";
import {
  describeRetryables,
  RETRY_QUESTION,
  retryChoices,
  type RetryAnswer,
} from "./retry-choices.js";

/**
 * The update pipeline on a plain terminal: `gup update`, and the menu when it
 * runs updates outside the screen. Installers print straight to the terminal;
 * this side adds the section headers between them, asks the questions with
 * the standalone prompts, and prints the summary.
 */

export interface ConsolePortsOptions {
  /** The skip session: Ctrl+C ×2 stops the batch. */
  readonly gate: AbortGate;
  /** `-y`: elevate without asking, never retry with destructive flags. */
  readonly yes?: boolean;
}

export function consolePorts(options: ConsolePortsOptions): UpdatePorts {
  const run = new ConsoleRun(options.yes === true);
  return { observer: run, decisions: run, gate: options.gate };
}

/** The observer and the decisions share what was planned, to title each section. */
class ConsoleRun implements UpdateObserver, UpdateDecisions {
  readonly #isUnattended: boolean;
  #plan: UpdatePlan = { direct: [], elevated: [] };
  #retryRequest: RetryRequest = { failures: [], strategies: [] };
  #lastSection = "";

  constructor(isUnattended: boolean) {
    this.#isUnattended = isUnattended;
  }

  planned(plan: UpdatePlan): void {
    this.#plan = plan;
    this.#lastSection = "";
  }

  started({ item, retry }: Attempt): void {
    if (retry) {
      const request = this.#retryRequest;
      this.#section(`${retry}:${item.providerId}`, () => retryHeader(item, retry, request));
      return;
    }
    if (!item.pkg) {
      // `gup update provider:id`: one line per target, as each starts.
      process.stdout.write(chalk.bold(`→ ${item.providerName}: ${item.packageId}\n`));
      return;
    }
    this.#section(`direct:${item.providerId}`, () => providerHeader(item, this.#plan));
  }

  finished(): void {}

  elevationStarted(): void {}

  cancelled(): void {}

  waiting(holder: BatchHolder): void {
    process.stdout.write(chalk.dim(`  ${waitingMessage(holder)}\n`));
  }

  async confirmElevation(count: number): Promise<boolean> {
    const targets = this.#plan.elevated.map((item) => item.key).join(", ");
    process.stdout.write(chalk.bold(`\n→ Admin (${count})\n`) + chalk.dim(`  ${targets}\n`));
    if (this.#isUnattended) return true;
    return confirm({ message: elevationQuestion(count), default: true });
  }

  async chooseRetry(request: RetryRequest): Promise<RetryStrategyId | null> {
    // Explicit opt-in only: an unattended run never bypasses a hash nor uninstalls.
    if (this.#isUnattended) return null;
    this.#retryRequest = request;
    process.stdout.write(chalk.dim(`\n  ${describeRetryables(request.failures)}\n`));
    const answer = await select<RetryAnswer>({
      message: RETRY_QUESTION,
      default: "none",
      choices: retryChoices(request.strategies),
    });
    return answer === "none" ? null : answer;
  }

  /** Print a section header once, when the run enters a new section. */
  #section(id: string, header: () => string): void {
    if (id === this.#lastSection) return;
    this.#lastSection = id;
    process.stdout.write(header());
  }
}

function providerHeader(item: PlannedUpdate, plan: UpdatePlan): string {
  const count = plan.direct.filter((planned) => planned.providerId === item.providerId).length;
  return chalk.bold(`\n→ ${item.providerName} (${count})\n`);
}

function retryHeader(item: PlannedUpdate, retry: RetryStrategyId, request: RetryRequest): string {
  const label = RETRY_TIERS.find((tier) => tier.id === retry)?.historyLabel ?? retry;
  const count = request.failures.filter((f) => f.providerId === item.providerId).length;
  return `\n${chalk.bold(`  ↻ ${item.providerName} (${label})`)} ${chalk.dim(`(${count})`)}\n`;
}

/** Windows elevates through a UAC prompt; elsewhere sudo asks in this terminal. */
function elevationQuestion(count: number): string {
  const need = `${count} paquet(s) nécessitent les droits administrateur`;
  return process.platform === "win32"
    ? `${need}. Ouvrir une invite UAC pour les traiter en bloc ?`
    : `${need} : sudo demandera votre mot de passe. Les traiter en bloc ?`;
}

function waitingMessage(holder: BatchHolder): string {
  const since = new Date(holder.startedAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const who =
    holder.kind === "scheduled"
      ? "Une mise à jour planifiée est en cours"
      : "Une autre mise à jour gup est en cours";
  return `${who} (depuis ${since}) — attente… (Ctrl+C pour abandonner)`;
}

/** The end-of-run summary: successes (with their advisories), skips, failures. */
export function printReport(report: UpdateReport): void {
  const { succeeded, skipped, failed } = report;
  process.stdout.write("\n");
  if (succeeded.length > 0) {
    process.stdout.write(chalk.green(`OK   ${succeeded.length} mise(s) à jour effectuée(s)\n`));
    // An advisory on a success (choco exit 3010: installed, reboot required)
    // is an action the user must take; "OK" alone would hide it.
    for (const outcome of succeeded) {
      if (!outcome.message) continue;
      const advisory = chalk.dim(` — ${outcome.message}`);
      process.stdout.write(`${chalk.green(`     - ${outcome.id}`)}${advisory}\n`);
    }
  }
  writeGroup(skipped, chalk.yellow, `SKIP ${skipped.length} action(s) manuelle(s) requise(s):\n`);
  const total = report.entries.length;
  writeGroup(failed, chalk.red, `FAIL ${failed.length}/${total} échec(s):\n`);
}

/** Coloured header, then one `- <id> — <message>` line per entry. */
function writeGroup(
  outcomes: readonly UpdateOutcome[],
  color: (text: string) => string,
  header: string,
): void {
  if (outcomes.length === 0) return;
  process.stdout.write(color(header));
  for (const outcome of outcomes) {
    const detail = outcome.message ? chalk.dim(` — ${outcome.message}`) : "";
    process.stdout.write(color(`     - ${outcome.id}`) + detail + "\n");
  }
}
