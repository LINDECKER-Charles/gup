import type { SharingState } from "../../core/feedback/sharing-state.js";
import { isCiRun } from "../../core/state/ci-run.js";

/**
 * When gup may ask whether to share the journals: once — while no answer is
 * saved — before the first command that writes them (the menu, `update`,
 * `list`), and only with someone at the keyboard. Never in a script or a CI
 * job (`--json`, `--yes`, `CI`), never without a terminal on both ends or
 * under `GUP_NONINTERACTIVE`, never when `GUP_SHARE_LOGS` already said no,
 * and never when the machine gives gup no state directory: the answer could
 * not be kept, so the question would come back every run.
 */

export interface ConsentFacts {
  readonly commandPath: string;
  readonly options: Readonly<Record<string, unknown>>;
  readonly env: NodeJS.ProcessEnv;
  readonly state: SharingState;
  /** A screen can be shown: both ends are a terminal and the run is attended. */
  readonly canPrompt: boolean;
  /** The answer can be saved (`SharingControl.canKeepAnswer`). */
  readonly canKeepAnswer: boolean;
}

/** "" is the program's own action: the menu. */
const ASKING_COMMANDS: ReadonlySet<string> = new Set(["", "update", "list"]);
/** Flags that say a script, not a person, reads the output or answers the questions. */
const UNATTENDED_FLAGS = ["json", "yes"] as const;

export function shouldAskConsent(facts: ConsentFacts): boolean {
  if (facts.state !== "ask" || !ASKING_COMMANDS.has(facts.commandPath)) return false;
  if (UNATTENDED_FLAGS.some((flag) => facts.options[flag] === true)) return false;
  if (isCiRun(facts.env)) return false;
  return facts.canPrompt && facts.canKeepAnswer;
}
