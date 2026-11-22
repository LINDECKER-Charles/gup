import chalk from "chalk";
import type { Command } from "commander";
import type { OpenResult } from "../../core/export/open-external.js";
import { ERROR_LABELS } from "../../ui/text/cli-labels.js";
import { FEEDBACK_CLI_LABELS as LABELS } from "../../ui/text/feedback/feedback-cli-labels.js";
import { endCommand } from "../cli/startup.js";
import type { SharingControl } from "./sharing-control.js";

/**
 * `gup feedback` and its subcommands: the way to the feedback form (with the
 * install ID a report should quote), the ID alone for a script, the sharing
 * switch, and where sharing stands. Plain text only: the output is a few
 * lines a person reads, and no other command of gup speaks JSON globally.
 * Each one says on stderr when a `GUP_FEEDBACK_*` override is refused.
 * `gup feedback` ends through `endCommand`: showing the form requests a
 * sync, which the feedback module runs before the process exits.
 */

export interface FeedbackCommandDeps {
  readonly sharing: () => SharingControl;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
  readonly openPage: (url: string) => Promise<OpenResult>;
  /** Somebody can see a browser open: a terminal, outside CI. */
  readonly isWatched: () => boolean;
}

const FAILURE_EXIT_CODE = 1;
const USAGE_EXIT_CODE = 2;
const SHARE_CHOICES: Readonly<Record<string, boolean>> = { on: true, off: false };

export class FeedbackCommands {
  readonly #deps: FeedbackCommandDeps;

  constructor(deps: FeedbackCommandDeps) {
    this.#deps = deps;
  }

  register(program: Command): void {
    const feedback = program
      .command("feedback")
      .description(LABELS.commandDescription)
      .option("--no-open", LABELS.noOpen)
      .action(async (opts: { open: boolean }) => endCommand(await this.form(opts.open)));
    feedback
      .command("id")
      .description(LABELS.idDescription)
      .action(() => process.exit(this.id()));
    feedback
      .command("share")
      .description(LABELS.shareDescription)
      .argument("<choice>", LABELS.shareArgument)
      .action(async (choice: string) => process.exit(await this.share(choice)));
    feedback
      .command("status")
      .description(LABELS.statusDescription)
      .action(() => process.exit(this.status()));
  }

  /**
   * The install ID and the form's address; the form opens unless `--no-open`
   * or nobody watches. Either way a report is coming: the journals are synced
   * before the process exits, whatever the weekly cadence says.
   */
  async form(shouldOpen: boolean): Promise<number> {
    const sharing = this.#sharing();
    const installId = sharing.createInstallId();
    if (installId === null) return this.#fail(LABELS.noIdentity);
    this.#deps.write(`${LABELS.installId(installId)}\n`);
    const url = sharing.formUrl(installId);
    if (url === null) return FAILURE_EXIT_CODE;
    sharing.requestSync();
    this.#deps.write(`${LABELS.form(url)}\n${chalk.dim(LABELS.idHint)}\n`);
    if (!shouldOpen || !this.#deps.isWatched()) return 0;
    const result = await this.#deps.openPage(url);
    if (!result.opened) this.#deps.writeError(`${LABELS.openFailed}\n`);
    return 0;
  }

  /** The install ID alone, for a script or a paste. */
  id(): number {
    const installId = this.#deps.sharing().createInstallId();
    if (installId === null) return this.#fail(LABELS.noIdentity);
    this.#deps.write(`${installId}\n`);
    return 0;
  }

  /** `on` saves the consent; `off` saves the refusal and erases what was shared (best effort). */
  async share(choice: string): Promise<number> {
    const isShared = SHARE_CHOICES[choice.trim().toLowerCase()];
    if (isShared === undefined) return this.#fail(LABELS.unknownChoice(choice), USAGE_EXIT_CODE);
    const sharing = this.#sharing();
    try {
      if (!isShared) {
        this.#deps.write(`${LABELS.erasure[await sharing.withdraw()]}\n`);
        return 0;
      }
      sharing.decide("granted");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return this.#fail(LABELS.saveFailed(reason));
    }
    this.#deps.write(`${LABELS.sharedOn}\n`);
    if (sharing.state() === "forced-off") this.#deps.writeError(`${LABELS.forcedOffWarning}\n`);
    return 0;
  }

  /**
   * Where sharing stands: the decision, the install ID, the last upload and,
   * while sharing is on, when the next sync is due. Creates nothing.
   */
  status(): number {
    const sharing = this.#sharing();
    const state = sharing.state();
    const installId = sharing.installId();
    const lastUpload = sharing.lastUploadAt();
    const lines = [
      LABELS.status(LABELS.states[state]),
      installId === null ? LABELS.idNotCreated : LABELS.installId(installId),
      lastUpload === null ? LABELS.neverUploaded : LABELS.lastUpload(lastUpload),
    ];
    if (state === "granted") lines.push(nextSyncLine(sharing.nextSyncDue()));
    this.#deps.write(`${lines.join("\n")}\n`);
    return 0;
  }

  /** The shared control, once any refused override has been reported. */
  #sharing(): SharingControl {
    const sharing = this.#deps.sharing();
    for (const name of sharing.rejectedOverrides()) {
      this.#deps.writeError(`${chalk.yellow(LABELS.overrideRejected(name))}\n`);
    }
    return sharing;
  }

  #fail(message: string, code = FAILURE_EXIT_CODE): number {
    this.#deps.writeError(`${chalk.red(ERROR_LABELS.prefix)} ${message}\n`);
    return code;
  }
}

function nextSyncLine(dueAt: string | null): string {
  return dueAt === null ? LABELS.nextSyncNow : LABELS.nextSync(dueAt);
}
