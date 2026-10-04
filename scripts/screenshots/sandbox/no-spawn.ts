/** The refusal every guarded function throws. */
export const SPAWN_REFUSED = "screenshots must not spawn processes";

/**
 * Every module of gup that can start a process or reach the OS, with the
 * exports known not to: those keep their real body. Anything else a guarded
 * module exports is refused, including a function added after this list was
 * written — a new export must be reviewed here before a screenshot may call it.
 */
export const PROCESS_FREE = {
  /** `src/core/runner.ts`: package managers, probes, the detached opener, tree kills. */
  runner: new Set([
    "getInstallTimeoutSeconds",
    "setInstallTimeoutSeconds",
    "consumeInterrupt",
    "normalizeExitCode",
    // Stops the install the runner started; with every start refused, there is none.
    "skipCurrent",
  ]),
  /** `src/core/pty/pty-loader.ts`: loading node-pty runs a probe in a pseudo-terminal. */
  ptyLoader: new Set<string>(),
  /** `src/core/export/open-external.ts`: the HTML report's browser opener. */
  opener: new Set(["openerFor"]),
  /** `src/core/scheduler/trigger/trigger-factory.ts`: Task Scheduler, launchd, crontab. */
  osTrigger: new Set(["systemRootOf"]),
} as const satisfies Readonly<Record<string, ReadonlySet<string>>>;

const NOTHING_KNOWN: ReadonlySet<string> = new Set();

/** How many string arguments an attempt records: enough to tell which probe it was. */
const RECORDED_ARGS = 3;

/**
 * Keeps screenshots from touching the machine. `src/core/runner.ts` is gup's
 * only spawn site for package managers (pinned by the process-chokepoint
 * drift test); node-pty's loader, the report opener and the scheduler's OS
 * trigger factory are guarded as well, at their entry points, so a scene
 * that reaches one fails there and names it. Providers swallow probe errors
 * by design: a refusal alone could go unnoticed, so every refused call is
 * also recorded, and the generator fails the scene that made one.
 */
export interface SpawnGuard {
  /** `module` with every function export not in `processFree` replaced by a refusal. */
  guard<T extends object>(module: T, processFree?: ReadonlySet<string>): T;
  /** Refused calls since the last reset, as `name arg arg…`. */
  readonly attempts: readonly string[];
  reset(): void;
}

class RecordingSpawnGuard implements SpawnGuard {
  #attempts: string[] = [];

  get attempts(): readonly string[] {
    return this.#attempts;
  }

  guard<T extends object>(module: T, processFree: ReadonlySet<string> = NOTHING_KNOWN): T {
    const entries = Object.entries(module).map(([name, value]) =>
      typeof value === "function" && !processFree.has(name)
        ? [name, this.refusal(name)]
        : [name, value],
    );
    return Object.fromEntries(entries) as T;
  }

  reset(): void {
    this.#attempts = [];
  }

  private refusal(name: string): (...args: unknown[]) => never {
    return (...args) => {
      const argv = args.flat().filter((arg) => typeof arg === "string").slice(0, RECORDED_ARGS);
      this.#attempts.push([name, ...argv].join(" "));
      throw new Error(`${SPAWN_REFUSED} (${name})`);
    };
  }
}

/** One guard per worker: the module mocks install it, the generator reads its attempts. */
export const spawnGuard: SpawnGuard = new RecordingSpawnGuard();

/**
 * The body of a `vi.mock` factory: the real module, guarded with the
 * process-free list of `kind` — `vi.mock(path, async (load) =>
 * (await import("…/no-spawn.js")).guardedModule(load, "runner"))`.
 */
export async function guardedModule(
  load: () => Promise<object>,
  kind: keyof typeof PROCESS_FREE,
): Promise<object> {
  return spawnGuard.guard(await load(), PROCESS_FREE[kind]);
}
