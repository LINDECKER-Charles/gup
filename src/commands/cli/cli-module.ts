import type { Command } from "commander";
import type { RunTrigger } from "../../core/state/run-context.js";

/**
 * How a feature plugs into the command line without editing `main.ts`: it
 * registers its commands and global options, wires its process-wide slots
 * (log backend, launcher, batch guard…) before the action runs, contributes
 * lines to `gup doctor`, and hears about a crash. Every module is one line in
 * `cli-modules.ts`.
 */

export interface RegisterContext {
  /** Every module, for the commands that aggregate them (`gup doctor`). */
  readonly modules: readonly CliModule[];
}

export interface StartupContext {
  /** The command about to run: "" (menu), "update", "log export", "__schedule-tick"… */
  readonly commandPath: string;
  /** Its options, global ones included (commander's optsWithGlobals()). */
  readonly options: Readonly<Record<string, unknown>>;
}

/** One line of the "System" section of `gup doctor`, in the interface's language. */
export interface DiagnosticLine {
  readonly label: string;
  readonly value: string;
  readonly status: "ok" | "warn" | "off";
}

export interface CliModule {
  readonly id: string;
  /** beforeAction order, lower first — see {@link MODULE_ORDER}. */
  readonly order: number;
  /**
   * The elevated `__admin-batch` child runs only the modules that opt in:
   * whatever a module wires there runs with administrator rights, and must
   * not read the user's settings. Default false.
   */
  readonly runsInElevatedChild?: boolean;
  /** Add commands and global options. */
  register?(program: Command, context: RegisterContext): void;
  /**
   * What started a run of this command, when the module knows better than
   * "menu"/"cli" (the scheduler's tick says "schedule"). Consulted before any
   * beforeAction, so every module already sees the trigger.
   */
  triggerFor?(commandPath: string): RunTrigger | undefined;
  /** Composition: install this module's slots for the command about to run. */
  beforeAction?(context: StartupContext): void | Promise<void>;
  /** Lines for the "System" section of `gup doctor`. */
  diagnostics?(): Promise<readonly DiagnosticLine[]>;
  /** The process is about to exit on an uncaught error. Must not throw. */
  onCrash?(error: unknown): void;
}

/**
 * beforeAction order of the modules that need one: logging first (so every
 * later step can log), then the settings everything else reads, then the
 * scheduler. The command modules only register commands.
 */
export const MODULE_ORDER = {
  logging: 10,
  settings: 20,
  scheduler: 50,
  commands: 100,
} as const;
