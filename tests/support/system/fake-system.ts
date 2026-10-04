import { fakeFetch } from "./fake-net.js";
import { loadMachine, machine, resetMachine } from "./machine.js";
import { restoreIdentity } from "./os-identity.js";
import type { Fault, InstallAnswer, SystemSpec, Trace } from "./types.js";

/**
 * The fake machine, as tests see it. The providers project's setupFile
 * (install.ts) resets it before every test and restores the real process
 * after; a test describes the machine it needs with `load(spec)`.
 */
export interface FakeSystem {
  /** Resolve fixture refs, set platform/env/homedir/uid, reset trace, faults and queues. */
  load(spec: SystemSpec): Promise<void>;
  /** Back to an empty machine of the host platform, violations forgotten (beforeEach). */
  reset(): void;
  /** Restore the real `process.platform`, `process.env` and `getuid` (afterEach). */
  restore(): void;
  /** Make every matching spawn, request or fs access fail; applies until the next load. */
  inject(fault: Fault): void;
  /** Queue answers for the next installs (`runInherit`), in order; exit 0 once drained. */
  answerInstall(...answers: readonly InstallAnswer[]): void;
  /** Explore mode (fault sweeps only): unscripted calls fail instead of throwing. */
  explore(isOn: boolean): void;
  /** Forget the strict-mode violations a test provoked on purpose. */
  acknowledgeUnscripted(): void;
  /** Strict-mode violations since the last reset, swallowed by the code under test or not. */
  readonly unscripted: readonly Error[];
  readonly trace: Trace;
  readonly fetch: typeof fetch;
}

export const system: FakeSystem = {
  load: loadMachine,
  reset: resetMachine,
  restore: restoreIdentity,
  inject(fault) {
    machine().faults.push(fault);
  },
  answerInstall(...answers) {
    machine().installAnswers.push(...answers);
  },
  explore(isOn) {
    machine().isExploring = isOn;
  },
  acknowledgeUnscripted() {
    machine().unscripted.length = 0;
  },
  get unscripted() {
    return machine().unscripted;
  },
  get trace() {
    const state = machine();
    return { spawns: state.spawns, requests: state.requests, fsReads: state.fsReads };
  },
  fetch: fakeFetch,
};
