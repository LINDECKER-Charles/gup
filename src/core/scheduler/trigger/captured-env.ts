import { hasControlCharacter } from "../model/schedule-target.js";

/**
 * launchd and cron start the tick with a bare environment
 * (`PATH=/usr/bin:/bin`), where Homebrew, npm, cargo or pyenv would vanish.
 * At install time gup records an allowlist of the user's variables — the
 * ones that say where tools live — and the tick applies them first. Never
 * credentials: tokens, keys and passwords are not on the list, whatever
 * the shell holds. Windows needs none of this: Task Scheduler gives the
 * task the user's registry environment.
 */

export const CAPTURED_ENV_NAMES: readonly string[] = [
  "PATH",
  "LANG",
  "LC_ALL",
  "HOMEBREW_PREFIX",
  "HOMEBREW_CELLAR",
  "HOMEBREW_REPOSITORY",
  "NVM_DIR",
  "FNM_DIR",
  "VOLTA_HOME",
  "PNPM_HOME",
  "BUN_INSTALL",
  "DENO_INSTALL",
  "PYENV_ROOT",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "GOPATH",
  "GOROOT",
  "JAVA_HOME",
  "SDKMAN_DIR",
  "ASDF_DIR",
  "ASDF_DATA_DIR",
  "DOTNET_ROOT",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "WAYLAND_DISPLAY",
];

/** gup's own settings travel too, except those that only make sense in one process. */
const GUP_PREFIX = "GUP_";
const NOT_CAPTURED = new Set(["GUP_NONINTERACTIVE", "GUP_SCHEDULER_DIR"]);
const MAX_VALUE_LENGTH = 32 * 1024;

export type CapturedEnv = Readonly<Record<string, string>>;

/** The allowlisted variables of `env` (none on Windows). */
export function captureEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): CapturedEnv {
  if (platform === "win32") return {};
  const names = Object.keys(env).filter(isCaptured).sort();
  const entries = names.flatMap((name): Array<[string, string]> => {
    const value = env[name];
    return value !== undefined && isSafeValue(value) ? [[name, value]] : [];
  });
  return Object.fromEntries(entries);
}

/** Put the captured variables into `target` (the tick's own environment). */
export function applyCapturedEnv(captured: CapturedEnv, target: NodeJS.ProcessEnv): void {
  for (const [name, value] of Object.entries(captured)) {
    if (isCaptured(name) && isSafeValue(value)) target[name] = value;
  }
}

function isCaptured(name: string): boolean {
  if (CAPTURED_ENV_NAMES.includes(name)) return true;
  return name.startsWith(GUP_PREFIX) && !NOT_CAPTURED.has(name);
}

function isSafeValue(value: string): boolean {
  return value.length <= MAX_VALUE_LENGTH && !hasControlCharacter(value);
}
