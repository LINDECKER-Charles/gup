import { localized } from "../../i18n/localized.js";
import { run, type RunResult } from "../../runner.js";
import type { TaskCommand } from "./task-command.js";

/**
 * The OS side of the scheduler: one per-user trigger that starts
 * `gup __schedule-tick` every 15 minutes, registered only while at least one
 * schedule is enabled. Windows Task Scheduler, a macOS launchd user agent, or
 * the user's crontab on Linux; every artefact is built by a pure function
 * (`../artifacts/`), so each platform's output is tested on any platform.
 */

export type Mechanism = "windows-task" | "launchd" | "crontab";

/**
 * Windows only. "headless" wraps node in `conhost.exe --headless` so no
 * console window flashes every 15 minutes; "direct" starts node.exe itself
 * (a visible console), for machines whose security software flags headless
 * conhost.
 */
export type Launcher = "headless" | "direct";

export const DEFAULT_LAUNCHER: Launcher = "headless";

export interface TriggerRegistration {
  readonly command: TaskCommand;
  readonly launcher: Launcher;
}

export interface TriggerStatus {
  readonly isInstalled: boolean;
  /** macOS: the user switched the agent off in Login Items. */
  readonly isDisabledByUser: boolean;
}

export interface OsTrigger {
  readonly mechanism: Mechanism;
  /** Register (or replace) the trigger. Throws with a reason for the user. */
  install(registration: TriggerRegistration): Promise<void>;
  /** Remove the trigger; nothing registered is not an error. Throws with a reason for the user. */
  uninstall(): Promise<void>;
  /** What the OS reports. Never throws: an unreadable state reads as not installed. */
  status(): Promise<TriggerStatus>;
  /** Where the trigger lives, for `gup schedule status` (task name, plist path…). */
  location(): Promise<string>;
}

export interface TriggerRunOptions {
  /** Written to the child's stdin (`crontab -`). */
  readonly input?: string;
  /** Added to the inherited environment (`LC_ALL=C`). */
  readonly env?: Readonly<Record<string, string>>;
}

/** The spawn the adapters use: argv only, no shell. */
export type TriggerRunner = (
  command: string,
  args: string[],
  options?: TriggerRunOptions,
) => Promise<RunResult>;

export const DEFAULT_TRIGGER_RUNNER: TriggerRunner = (command, args, options = {}) =>
  run(command, args, {
    ...(options.input !== undefined && { input: options.input }),
    ...(options.env !== undefined && { env: { ...options.env } }),
  });

const COMMAND_ERRORS = localized({
  en: {
    failed: (command: string, code: number, output: string) =>
      `${command} failed (code ${code}): ${output}`,
  },
  fr: {
    failed: (command, code, output) => `${command} a échoué (code ${code}) : ${output}`,
  },
});

/** First non-empty line of a command's output, for an error message. */
export function firstLineOf(result: RunResult): string {
  const text = `${result.stderr}\n${result.stdout}`;
  return text.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "";
}

/**
 * The error of an OS command that failed — `command` is what ran, as the
 * user would type it ("schtasks /Create") — with its exit code and the first
 * line it wrote, which speaks the machine's language.
 */
export function commandFailure(command: string, result: RunResult): Error {
  return new Error(COMMAND_ERRORS.failed(command, result.exitCode, firstLineOf(result)));
}
