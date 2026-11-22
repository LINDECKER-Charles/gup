import { collectSharedJournals } from "../../core/export/shared-journals.js";
import { currentClientInfo } from "../../core/feedback/client-info.js";
import { callFeedbackService, type FetchLike } from "../../core/feedback/feedback-client.js";
import { FeedbackUrls } from "../../core/feedback/feedback-urls.js";
import {
  loadInstallIdentity,
  readInstallIdentity,
  type InstallIdentity,
} from "../../core/feedback/install-identity.js";
import { uploadJournals, type UploadLimits } from "../../core/feedback/journal-uploader.js";
import { SharingDecisionFile } from "../../core/feedback/sharing-decision-file.js";
import {
  sharingState,
  type ErasureOutcome,
  type SharingDecision,
  type SharingState,
} from "../../core/feedback/sharing-state.js";
import { UploadCursorFile } from "../../core/feedback/upload-cursor.js";
import { activeLocale } from "../../core/i18n/locale.js";
import { log } from "../../core/log/log.js";
import { stateDir } from "../../core/state/app-dirs.js";

/**
 * Everything the command line and the menu do with feedback, behind one
 * facade: the user's sharing decision (and the environment's veto), the
 * install identity, the upload of the journals and their erasure. The
 * private key never leaves this module and the core it calls; what goes out
 * is the install id, the form's address and outcomes.
 *
 * The identity is created only by an explicit act — consent given, the
 * form opened, the ID asked for or copied, an upload; reading where things
 * stand (`gup doctor`, `gup feedback status`, the menu's drawings) never
 * creates it. A failure to read or create it is remembered for the process:
 * no command waits on the file lock twice.
 */

export interface SharingDeps {
  readonly env: NodeJS.ProcessEnv;
  /** The machine-local `feedback` state directory, or null when there is none. */
  readonly dir: () => string | null;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly limits?: Partial<UploadLimits>;
}

type Answer = Exclude<SharingDecision, "ask">;

const ERASE_TIMEOUT_MS = 5_000;
const NO_STATE_DIR = "this machine gives gup no folder for its state";

const PROCESS_SHARING_DEPS: SharingDeps = {
  env: process.env,
  dir: () => stateDir("feedback"),
};

export class SharingControl {
  readonly #deps: SharingDeps;
  /** Kept once found: an identity is never replaced, and the menu reads it on every draw. */
  #identity: InstallIdentity | null = null;
  #hasIdentityFailed = false;
  #urls: FeedbackUrls | null = null;
  #erasing: Promise<ErasureOutcome> | null = null;

  constructor(deps: SharingDeps = PROCESS_SHARING_DEPS) {
    this.#deps = deps;
  }

  /** The decision as it applies to this run, read from disk every time. */
  state(): SharingState {
    const dir = this.#deps.dir();
    const decision = dir === null ? "ask" : new SharingDecisionFile(dir).read();
    return sharingState(decision, this.#deps.env);
  }

  /** An answer can be saved: the machine gives gup a state directory. */
  canKeepAnswer(): boolean {
    return this.#deps.dir() !== null;
  }

  /** The install id when it exists; never creates it. */
  installId(): string | null {
    return this.#find(readInstallIdentity)?.installId ?? null;
  }

  /** The install id, created when there is none yet; null when it can be neither read nor made. */
  createInstallId(): string | null {
    return this.#find(loadInstallIdentity)?.installId ?? null;
  }

  /** When the service last acknowledged a batch, ISO 8601; null when never. */
  lastUploadAt(): string | null {
    const dir = this.#deps.dir();
    return dir === null ? null : new UploadCursorFile(dir).read().lastUploadAt;
  }

  /** The feedback form in the interface's language, prefilled; null when the override is refused. */
  formUrl(installId: string): string | null {
    return this.#feedbackUrls().formUrl({ installId, client: currentClientInfo(activeLocale()) });
  }

  /** `GUP_FEEDBACK_*` variables set to an address gup refuses. */
  rejectedOverrides(): readonly string[] {
    return this.#feedbackUrls().rejected();
  }

  /**
   * Save the user's answer. A yes creates the install identity; a yes after
   * a no shares only what is written from now on — the 30-day backlog is
   * for the very first answer. Throws when the answer cannot be saved.
   */
  decide(decision: Answer): void {
    const dir = this.#deps.dir();
    if (dir === null) throw new Error(NO_STATE_DIR);
    const file = new SharingDecisionFile(dir);
    if (decision === "granted" && file.read() === "denied") {
      new UploadCursorFile(dir).startAt(new Date(this.#now()).toISOString());
    }
    file.save(decision);
    log.info("sharing.decision", { decision });
    if (decision === "granted") this.createInstallId();
  }

  /** Stop sharing: save the refusal, then {@link erase}. Throws when the refusal is not saved. */
  async withdraw(): Promise<ErasureOutcome> {
    this.decide("denied");
    return this.erase();
  }

  /**
   * Ask the service to erase what it holds — best effort — and, once it
   * did, forget how far the uploads went. Never rejects. The menu does not
   * wait for it; the process does, before it exits ({@link settled}).
   */
  erase(): Promise<ErasureOutcome> {
    const erasing = this.#erase();
    this.#erasing = erasing;
    return erasing;
  }

  /** Resolves once a pending erasure is over. Never rejects. */
  async settled(): Promise<void> {
    await this.#erasing;
  }

  /** Send the journals written since the last upload, when sharing is on. Never throws. */
  async upload(): Promise<void> {
    if (this.state() !== "granted") return;
    const dir = this.#deps.dir();
    const identity = this.#find(loadInstallIdentity);
    const url = identity === null ? null : this.#feedbackUrls().installLogsUrl(identity.installId);
    if (dir === null || identity === null || url === null) return;
    const { fetch, now, limits } = this.#deps;
    await uploadJournals({
      identity,
      cursor: new UploadCursorFile(dir),
      url,
      client: currentClientInfo(activeLocale()),
      collect: (query) =>
        collectSharedJournals({
          ...query,
          dirs: { history: stateDir("history"), logs: stateDir("logs") },
        }),
      isGranted: () => this.state() === "granted",
      ...(fetch !== undefined && { fetch }),
      ...(now !== undefined && { now }),
      ...(limits !== undefined && { limits }),
    });
  }

  async #erase(): Promise<ErasureOutcome> {
    const dir = this.#deps.dir();
    if (dir === null) return "nothing-shared";
    const identity = this.#find(readInstallIdentity);
    if (identity === null) return this.#hasIdentityFailed ? "failed" : "nothing-shared";
    const url = this.#feedbackUrls().installUrl(identity.installId);
    if (url === null) return "failed";
    const request = {
      method: "DELETE" as const,
      url,
      identity,
      timeoutMs: ERASE_TIMEOUT_MS,
      signedAt: this.#now(),
    };
    const outcome = await callFeedbackService(request, this.#deps.fetch);
    log.info("sharing.erase", { ok: outcome.ok, status: outcome.status ?? null });
    if (!outcome.ok) return "failed";
    forgetCursor(dir);
    return "erased";
  }

  #find(find: (dir: string) => InstallIdentity | null): InstallIdentity | null {
    const dir = this.#deps.dir();
    if (this.#identity !== null || this.#hasIdentityFailed || dir === null) return this.#identity;
    try {
      this.#identity = find(dir);
    } catch (error) {
      this.#hasIdentityFailed = true;
      log.warn("sharing.identity-failed", { error });
    }
    return this.#identity;
  }

  #feedbackUrls(): FeedbackUrls {
    if (this.#urls !== null) return this.#urls;
    const urls = new FeedbackUrls(this.#deps.env);
    for (const variable of urls.rejected()) log.warn("sharing.override-rejected", { variable });
    this.#urls = urls;
    return urls;
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }
}

/** The service erased everything: how far the uploads went goes with it. */
function forgetCursor(dir: string): void {
  try {
    new UploadCursorFile(dir).clear();
  } catch (error) {
    log.warn("sharing.cursor-clear-failed", { error });
  }
}
