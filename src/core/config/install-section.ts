import { DEFAULT_INSTALL_TIMEOUT_S, setInstallTimeoutSeconds } from "../runner.js";
import { defineSection } from "./section.js";
import type { ConfigStore } from "./store.js";

/**
 * The `install` section: the per-install wall-clock cap. Unlike the scan
 * settings it applies to every command (`gup update` included): it is a
 * safety net, not a preference about what to show. The elevated child never
 * reads it — its parent passes the effective value in the batch payload.
 */

export interface InstallSettings {
  /** Seconds before a stuck install is skipped; 0 disables the cap. */
  readonly timeoutSeconds: number;
}

/** One day: the same ceiling the elevated batch payload accepts. */
const TIMEOUT_BOUNDS = { min: 0, max: 86_400 } as const;
const TIMEOUT_ENV = "GUP_INSTALL_TIMEOUT";

const DEFAULTS: InstallSettings = Object.freeze({ timeoutSeconds: DEFAULT_INSTALL_TIMEOUT_S });

export const INSTALL_SECTION = defineSection<InstallSettings>({
  key: "install",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({
    timeoutSeconds: read.integer("timeoutSeconds", TIMEOUT_BOUNDS, DEFAULTS.timeoutSeconds),
  }),
});

/**
 * Make the persisted timeout the effective one, unless `GUP_INSTALL_TIMEOUT`
 * is set: the environment wins over the file. The `--timeout` flag, applied
 * afterwards by the update action, wins over both.
 */
export function applyPersistedInstallTimeout(store: ConfigStore, env: NodeJS.ProcessEnv): void {
  const fromEnv = env[TIMEOUT_ENV];
  if (fromEnv !== undefined && fromEnv !== "") return;
  setInstallTimeoutSeconds(store.read(INSTALL_SECTION).timeoutSeconds);
}
