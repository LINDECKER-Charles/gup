import { homedir } from "node:os";

import { pathFlavour } from "../platform/path-flavour.js";

/**
 * Where gup keeps what it writes, per platform. One module so every kind of
 * state agrees on the same roots and env overrides. For a state `<kind>`
 * (history, logs, reports, scheduler; override `GUP_HISTORY_DIR`,
 * `GUP_LOG_DIR`, `GUP_REPORT_DIR`, `GUP_SCHEDULER_DIR`):
 *
 *   - Windows: `%LOCALAPPDATA%\gup\<kind>`
 *   - macOS:   `~/Library/Application Support/gup/<kind>`, except logs in
 *              `~/Library/Logs/gup`, where Console.app looks
 *   - other:   `$XDG_STATE_HOME/gup/<kind>`, else `~/.local/state/gup/<kind>`
 *
 * and for the user config (override `GUP_CONFIG_DIR`): `%APPDATA%\gup`,
 * `~/Library/Application Support/gup`, `$XDG_CONFIG_HOME/gup` (else
 * `~/.config/gup`).
 *
 * State is machine-local (`%LOCALAPPDATA%`, XDG *state*): an activity log or a
 * schedule names this machine's packages and must not roam. Preferences do
 * roam (`%APPDATA%`). A platform without an anchor (no `LOCALAPPDATA`, no
 * home) yields null rather than an invented path: writing into the working
 * directory would litter whatever repository the user happens to be in.
 */

export type StateKind = "history" | "logs" | "reports" | "scheduler";

/** What a location depends on; every field defaults to the running process. */
export interface DirContext {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly home: string;
}

const APP_DIR = "gup";

const STATE_OVERRIDE_ENV: Readonly<Record<StateKind, string>> = {
  history: "GUP_HISTORY_DIR",
  logs: "GUP_LOG_DIR",
  reports: "GUP_REPORT_DIR",
  scheduler: "GUP_SCHEDULER_DIR",
};

const CONFIG_OVERRIDE_ENV = "GUP_CONFIG_DIR";

/**
 * Machine-local dir for `kind` (its override env first), or null when the
 * platform gives no anchor.
 */
export function stateDir(kind: StateKind, context: Partial<DirContext> = {}): string | null {
  const ctx = resolveContext(context);
  const override = ctx.env[STATE_OVERRIDE_ENV[kind]];
  if (override) return override;
  const { join } = pathFlavour(ctx.platform);
  // Console.app lists ~/Library/Logs, so macOS logs go there rather than
  // under Application Support with the rest.
  if (kind === "logs" && ctx.platform === "darwin") {
    return ctx.home ? join(ctx.home, "Library", "Logs", APP_DIR) : null;
  }
  const root = stateRoot(ctx);
  return root ? join(root, APP_DIR, kind) : null;
}

/** User config dir (GUP_CONFIG_DIR first), or null when the platform gives no anchor. */
export function configDir(context: Partial<DirContext> = {}): string | null {
  const ctx = resolveContext(context);
  const override = ctx.env[CONFIG_OVERRIDE_ENV];
  if (override) return override;
  const root = configRoot(ctx);
  return root ? pathFlavour(ctx.platform).join(root, APP_DIR) : null;
}

function resolveContext(context: Partial<DirContext>): DirContext {
  const env = context.env ?? process.env;
  return {
    env,
    platform: context.platform ?? process.platform,
    home: context.home ?? defaultHome(env),
  };
}

/** `homedir()`, then `$HOME`; empty when neither resolves (a bare service account). */
function defaultHome(env: NodeJS.ProcessEnv): string {
  try {
    return homedir() || env["HOME"] || "";
  } catch {
    return env["HOME"] || "";
  }
}

/**
 * Root for machine-local, user-owned state. XDG files an activity log under
 * *state*, not *data*: it is history, not something to back up or sync.
 */
function stateRoot({ env, platform, home }: DirContext): string | null {
  const { join } = pathFlavour(platform);
  if (platform === "win32") return env["LOCALAPPDATA"] || null;
  if (platform === "darwin") return home ? join(home, "Library", "Application Support") : null;
  return env["XDG_STATE_HOME"] || (home ? join(home, ".local", "state") : null);
}

/** Root for user preferences, which follow the user across machines. */
function configRoot({ env, platform, home }: DirContext): string | null {
  const { join } = pathFlavour(platform);
  if (platform === "win32") return env["APPDATA"] || null;
  if (platform === "darwin") return home ? join(home, "Library", "Application Support") : null;
  return env["XDG_CONFIG_HOME"] || (home ? join(home, ".config") : null);
}
