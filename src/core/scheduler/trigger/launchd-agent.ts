import { mkdirSync, rmSync } from "node:fs";
import { posix } from "node:path";
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
}

const LAUNCHCTL = "/bin/launchctl";
const AGENTS_DIR_MODE = 0o755;

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

  constructor(options: LaunchdOptions) {
    this.#options = options;
    this.#run = options.run ?? DEFAULT_TRIGGER_RUNNER;
    this.#files = options.files ?? NODE_AGENT_FILES;
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
    const bootstrap = await this.#launchctl(["bootstrap", this.#domain, this.#plistPath]);
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

  #launchctl(args: string[]): Promise<RunResult> {
    return this.#run(LAUNCHCTL, args);
  }
}

function launchctlError(verb: string, result: RunResult): Error {
  return new Error(`launchctl ${verb} a échoué (code ${result.exitCode}) : ${firstLineOf(result)}`);
}
