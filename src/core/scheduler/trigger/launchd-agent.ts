import { mkdirSync, rmSync } from "node:fs";
import { posix } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileAtomic } from "../../config/atomic-write.js";
import type { RunResult } from "../../runner.js";
import {
  buildLaunchdPlist,
  isDisabledInLaunchd,
  LAUNCHD_LABEL,
} from "../artifacts/launchd-plist.js";
import {
  DEFAULT_TRIGGER_RUNNER,
  firstLineOf,
  type OsTrigger,
  type TriggerRegistration,
  type TriggerRunner,
  type TriggerStatus,
} from "./os-trigger.js";

/**
 * The trigger as a launchd agent of the logged-in user (`gui/<uid>` domain,
 * no sudo). Install writes the plist (atomically, owner-only: launchd
 * refuses a group- or world-writable one) then boots the agent out and in,
 * so a changed command takes effect; `/bin/launchctl` by absolute path. macOS
 * announces it as a "Background Item"; a user who switches it off in Login
 * Items is detected through `print-disabled` and told how to repair.
 */

/** File writes of the agent, injectable so tests never touch `~/Library`. */
export interface AgentFiles {
  write(path: string, content: string): void;
  remove(path: string): void;
}

export interface LaunchdOptions {
  readonly home: string;
  readonly uid: number;
  readonly stderrPath: string;
  readonly run?: TriggerRunner;
  readonly files?: AgentFiles;
  /** Waits between bootstrap attempts; injected so tests never sleep. */
  readonly sleep?: (ms: number) => Promise<unknown>;
}

const LAUNCHCTL = "/bin/launchctl";
const AGENTS_DIR_MODE = 0o755;
/**
 * `bootout` returns before launchd has finished tearing the agent down; a
 * `bootstrap` right behind it then fails with EIO ("Bootstrap failed: 5:
 * Input/output error") on some macOS releases. Only that answer is retried.
 */
const BOOTSTRAP_BUSY = /Bootstrap failed: 5(?!\d)/;
/** Waits before each new attempt: 0.25 + 0.5 + 1 s, then the failure stands. */
const BOOTSTRAP_RETRY_DELAYS_MS: readonly number[] = [250, 500, 1000];

const NODE_AGENT_FILES: AgentFiles = {
  write(path, content) {
    mkdirSync(posix.dirname(path), { recursive: true, mode: AGENTS_DIR_MODE });
    writeFileAtomic(path, content);
  },
  remove(path) {
    rmSync(path, { force: true });
  },
};

export class LaunchdTrigger implements OsTrigger {
  readonly mechanism = "launchd";
  readonly #options: LaunchdOptions;
  readonly #run: TriggerRunner;
  readonly #files: AgentFiles;
  readonly #sleep: (ms: number) => Promise<unknown>;

  constructor(options: LaunchdOptions) {
    this.#options = options;
    this.#run = options.run ?? DEFAULT_TRIGGER_RUNNER;
    this.#files = options.files ?? NODE_AGENT_FILES;
    this.#sleep = options.sleep ?? sleep;
  }

  get #plistPath(): string {
    return posix.join(this.#options.home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
  }

  get #domain(): string {
    return `gui/${this.#options.uid}`;
  }

  async install(registration: TriggerRegistration): Promise<void> {
    const plist = buildLaunchdPlist({
      command: registration.command,
      stderrPath: this.#options.stderrPath,
    });
    this.#files.write(this.#plistPath, plist);
    // Booting out first makes a reinstall pick up a changed command; absent is fine.
    await this.#launchctl(["bootout", `${this.#domain}/${LAUNCHD_LABEL}`]);
    const bootstrap = await this.#bootstrap();
    if (bootstrap.failed) throw launchctlError("bootstrap", bootstrap);
    const enable = await this.#launchctl(["enable", `${this.#domain}/${LAUNCHD_LABEL}`]);
    if (enable.failed) throw launchctlError("enable", enable);
  }

  async uninstall(): Promise<void> {
    await this.#launchctl(["bootout", `${this.#domain}/${LAUNCHD_LABEL}`]);
    this.#files.remove(this.#plistPath);
  }

  async status(): Promise<TriggerStatus> {
    try {
      const printed = await this.#launchctl(["print", `${this.#domain}/${LAUNCHD_LABEL}`]);
      const disabled = await this.#launchctl(["print-disabled", this.#domain]);
      return {
        isInstalled: !printed.failed,
        isDisabledByUser: !disabled.failed && isDisabledInLaunchd(disabled.stdout),
      };
    } catch {
      return { isInstalled: false, isDisabledByUser: false };
    }
  }

  async location(): Promise<string> {
    return this.#plistPath;
  }

  /** `bootstrap`, tried again while launchd is still booting the previous agent out. */
  async #bootstrap(): Promise<RunResult> {
    const args = ["bootstrap", this.#domain, this.#plistPath];
    let result = await this.#launchctl(args);
    for (const delay of BOOTSTRAP_RETRY_DELAYS_MS) {
      if (!result.failed || !BOOTSTRAP_BUSY.test(firstLineOf(result))) return result;
      await this.#sleep(delay);
      result = await this.#launchctl(args);
    }
    return result;
  }

  #launchctl(args: string[]): Promise<RunResult> {
    return this.#run(LAUNCHCTL, args);
  }
}

function launchctlError(verb: string, result: RunResult): Error {
  return new Error(`launchctl ${verb} a échoué (code ${result.exitCode}) : ${firstLineOf(result)}`);
}
