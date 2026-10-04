import { log } from "../../log/log.js";
import type { InstallRecord, InstallRecordStore } from "../persistence/install-record.js";
import type { CapturedEnv } from "./captured-env.js";
import { DEFAULT_LAUNCHER, type Launcher, type OsTrigger } from "./os-trigger.js";
import type { TaskCommand } from "./task-command.js";

/**
 * Keeps the invariant "at least one enabled schedule ⇔ the OS trigger is
 * registered", and the registration pointing at a gup that exists.
 *
 * - `reconcile` after a change of schedules: register when needed (the
 *   first time included), remove when nothing is enabled any more.
 * - `heal` when an interactive gup starts: the same, but never a first
 *   registration — a user who never scheduled anything gets nothing.
 * - `reinstall` / `remove`: `gup schedule install` / `uninstall`.
 *
 * Self-heal re-registers only for this installation: when the recorded node
 * or gup no longer exists (a Node upgrade, a moved prefix) or belongs to the
 * same package as the running one. A registration made by *another* gup
 * that still exists is left alone and reported (`foreign`): two
 * installations must not take the trigger from each other at every start;
 * `gup schedule install` moves it explicitly.
 */

export interface CurrentRegistration {
  readonly command: TaskCommand;
  readonly env: CapturedEnv;
}

export interface InstallationProbe {
  exists(path: string): boolean;
  /** The package root an entry point belongs to, symlinks resolved. */
  packageRoot(entry: string): string;
}

export interface TriggerSyncDeps {
  readonly trigger: OsTrigger;
  readonly records: Pick<InstallRecordStore, "read" | "write" | "remove">;
  /** The running gup's registration, or why it cannot be registered. */
  readonly current: () => CurrentRegistration | { readonly error: string };
  readonly probe: InstallationProbe;
  readonly clock: () => Date;
  readonly gupVersion: string;
  readonly platform: NodeJS.Platform;
}

export type SyncResult =
  | { readonly kind: "unchanged" | "installed" | "removed" }
  | { readonly kind: "foreign"; readonly entry: string }
  | { readonly kind: "failed"; readonly reason: string };

/** How a recorded registration relates to the running gup. */
export type RegistrationMatch = "same" | "drift" | "foreign";

const UNCHANGED: SyncResult = { kind: "unchanged" };

export class TriggerSync {
  readonly #deps: TriggerSyncDeps;

  constructor(deps: TriggerSyncDeps) {
    this.#deps = deps;
  }

  /** After schedules changed: register, repair or remove as `enabledCount` requires. */
  reconcile(enabledCount: number): Promise<SyncResult> {
    return this.#guarded(async () => {
      if (enabledCount === 0) return this.#removeIfPresent();
      const record = this.#deps.records.read();
      return record ? this.#keep(record) : this.#install(DEFAULT_LAUNCHER);
    });
  }

  /** At interactive start: like reconcile, only where gup registered before. */
  heal(enabledCount: number): Promise<SyncResult> {
    return this.#guarded(async () => {
      const record = this.#deps.records.read();
      if (!record) return UNCHANGED;
      return enabledCount === 0 ? this.#removeIfPresent() : this.#keep(record);
    });
  }

  /** Register this gup unconditionally, with `launcher` or the recorded one. */
  reinstall(launcher?: Launcher): Promise<SyncResult> {
    return this.#guarded(() =>
      this.#install(launcher ?? this.#deps.records.read()?.launcher ?? DEFAULT_LAUNCHER),
    );
  }

  /** Remove the trigger and its record. */
  remove(): Promise<SyncResult> {
    return this.#guarded(async () => {
      await this.#deps.trigger.uninstall();
      this.#deps.records.remove();
      log.info("scheduler.trigger-removed", { mechanism: this.#deps.trigger.mechanism });
      return { kind: "removed" };
    });
  }

  /** How `record` relates to the running gup (null when this gup cannot register). */
  matchOf(record: InstallRecord): RegistrationMatch | null {
    const current = this.#deps.current();
    if ("error" in current) return null;
    return registrationMatch(record, current.command, this.#deps);
  }

  /**
   * An existing registration: keep it when it is this gup's, or when this
   * gup cannot register itself (an npx copy) and the recorded one still
   * works; repair it otherwise.
   */
  async #keep(record: InstallRecord): Promise<SyncResult> {
    const match = this.matchOf(record);
    if (match === "foreign") return { kind: "foreign", entry: record.argv[1] ?? "" };
    if (match !== "drift" && (await this.#deps.trigger.status()).isInstalled) return UNCHANGED;
    return this.#install(record.launcher);
  }

  async #install(launcher: Launcher): Promise<SyncResult> {
    const current = this.#deps.current();
    if ("error" in current) return { kind: "failed", reason: current.error };
    const { trigger, clock, gupVersion, platform } = this.#deps;
    await trigger.install({ command: current.command, launcher });
    this.#deps.records.write({
      v: 1,
      platform,
      mechanism: trigger.mechanism,
      launcher,
      argv: argvOf(current.command),
      env: current.env,
      installedAt: clock().toISOString(),
      gupVersion,
    });
    log.info("scheduler.trigger-installed", { mechanism: trigger.mechanism, launcher });
    return { kind: "installed" };
  }

  async #removeIfPresent(): Promise<SyncResult> {
    const hasRecord = this.#deps.records.read() !== null;
    if (!hasRecord && !(await this.#deps.trigger.status()).isInstalled) return UNCHANGED;
    return this.remove();
  }

  async #guarded(work: () => Promise<SyncResult>): Promise<SyncResult> {
    try {
      return await work();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.warn("scheduler.trigger-failed", { reason });
      return { kind: "failed", reason };
    }
  }
}

/** The argv the OS runs, as recorded. */
export function argvOf(command: TaskCommand): string[] {
  return [command.node, command.entry, ...command.args];
}

/**
 * "same": the recorded argv is the running gup's. "drift": it is not, but
 * re-registering is safe — the recorded node or gup is gone, or belongs to
 * this same package. "foreign": another gup installation that still exists.
 */
export function registrationMatch(
  record: InstallRecord,
  command: TaskCommand,
  context: { readonly probe: InstallationProbe; readonly platform: NodeJS.Platform },
): RegistrationMatch {
  const isSame = (a: string, b: string): boolean =>
    context.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  const wanted = argvOf(command);
  const recorded = record.argv;
  if (wanted.length === recorded.length && wanted.every((arg, i) => isSame(arg, recorded[i]!))) {
    return "same";
  }
  const { probe } = context;
  const [node, entry] = recorded;
  if (!node || !entry || !probe.exists(node) || !probe.exists(entry)) return "drift";
  return isSame(probe.packageRoot(entry), probe.packageRoot(command.entry)) ? "drift" : "foreign";
}
