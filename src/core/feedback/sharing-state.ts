import { isSwitchedOff } from "../state/env-switch.js";

/**
 * Whether this run shares its journals: the user's decision, unless
 * `GUP_SHARE_LOGS=0|off|false|no` turns sharing off for the run — a CI job,
 * a managed machine — without touching the decision, and without ever
 * prompting. Pure: the feedback module, the uploader and `gup doctor` all
 * read the same answer.
 */

/** `ask` until the user answers; kept in `sharing.json` (`sharing-decision-file.ts`). */
export type SharingDecision = "ask" | "granted" | "denied";

/** The decision as it applies to this run; `forced-off` is the environment's veto. */
export type SharingState = SharingDecision | "forced-off";

/** What turning sharing off did to the journals already on the service. */
export type ErasureOutcome = "erased" | "nothing-shared" | "failed";

const SHARE_LOGS_ENV = "GUP_SHARE_LOGS";

export function sharingState(decision: SharingDecision, env: NodeJS.ProcessEnv): SharingState {
  return isSwitchedOff(env[SHARE_LOGS_ENV]) ? "forced-off" : decision;
}
