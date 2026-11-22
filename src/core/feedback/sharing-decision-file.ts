import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../config/atomic-write.js";
import type { SharingDecision } from "./sharing-state.js";

/**
 * The user's answer about sharing the journals, kept per install in the
 * machine-local `feedback` state directory (`sharing.json`, next to the
 * install identity) — never in `config.json`, which roams with the profile:
 * a yes given on one machine must not start uploads from another. Written
 * atomically, private (0600 where modes exist).
 *
 * A missing, unreadable or invalid file reads as `ask`: nothing is shared
 * until an answer is saved.
 */

const DECISION_FILE = "sharing.json";
const DECISION_VERSION = 1;
const DIR_MODE = 0o700;
const ANSWERS: ReadonlySet<string> = new Set<SharingDecision>(["granted", "denied"]);
const NO_ANSWER: SharingDecision = "ask";

export class SharingDecisionFile {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  read(): SharingDecision {
    try {
      const raw = JSON.parse(readFileSync(this.#file(), "utf8")) as Record<string, unknown>;
      const decision = raw["decision"];
      return typeof decision === "string" && ANSWERS.has(decision)
        ? (decision as SharingDecision)
        : NO_ANSWER;
    } catch {
      return NO_ANSWER;
    }
  }

  /** Save an answer, atomically. Throws on an I/O failure. */
  save(decision: Exclude<SharingDecision, "ask">): void {
    mkdirSync(this.#dir, { recursive: true, mode: DIR_MODE });
    // writeFileAtomic creates its temp file 0600: the rename keeps that mode.
    writeFileAtomic(this.#file(), `${JSON.stringify({ v: DECISION_VERSION, decision })}\n`);
  }

  #file(): string {
    return join(this.#dir, DECISION_FILE);
  }
}
