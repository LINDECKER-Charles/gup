/** The refusal every guarded runner function throws. */
export const SPAWN_REFUSED = "screenshots must not spawn processes";

/**
 * Runner exports that never start a process: they keep their real body.
 * Anything else the runner exports is refused, including a function added
 * after this list was written — a new runner export must be reviewed here
 * before a screenshot may call it.
 */
const PROCESS_FREE: ReadonlySet<string> = new Set([
  "getInstallTimeoutSeconds",
  "setInstallTimeoutSeconds",
  "consumeInterrupt",
  "normalizeExitCode",
  // Stops the install the runner started; with every start refused, there is none.
  "skipCurrent",
]);

/** How many argv items an attempt records: enough to tell which probe it was. */
const RECORDED_ARGS = 3;

/**
 * Keeps screenshots from touching the machine. `src/core/runner.ts` is gup's
 * only spawn site (pinned by the process-chokepoint drift test), so replacing
 * its process-starting exports covers every package manager, probe and
 * opener. Providers swallow probe errors by design: a refusal alone could go
 * unnoticed, so every refused call is also recorded, and the generator fails
 * the scene that made one.
 */
export interface SpawnGuard {
  /** `runner` with every function export not known to be process-free replaced by a refusal. */
  guard<T extends object>(runner: T): T;
  /** Refused calls since the last reset, as `name arg arg…`. */
  readonly attempts: readonly string[];
  reset(): void;
}

class RecordingSpawnGuard implements SpawnGuard {
  #attempts: string[] = [];

  get attempts(): readonly string[] {
    return this.#attempts;
  }

  guard<T extends object>(runner: T): T {
    const entries = Object.entries(runner).map(([name, value]) =>
      typeof value === "function" && !PROCESS_FREE.has(name)
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

/** One guard per worker: the runner mock installs it, the generator reads its attempts. */
export const spawnGuard: SpawnGuard = new RecordingSpawnGuard();
