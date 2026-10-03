import { pathFlavour } from "../platform/path-flavour.js";
import { configDir, type DirContext } from "../state/app-dirs.js";

/**
 * Where the settings file lives: `config.json` in the user config dir —
 * `%APPDATA%\gup` (preferences roam with the profile), `~/Library/Application
 * Support/gup`, `$XDG_CONFIG_HOME/gup` (else `~/.config/gup`), or
 * `$GUP_CONFIG_DIR`. Null when the platform gives no anchor: the store then
 * runs in memory rather than writing into the working directory.
 */

const CONFIG_FILE_NAME = "config.json";
const DISABLE_ENV = "GUP_CONFIG";
const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

export function configFilePath(context: Partial<DirContext> = {}): string | null {
  const dir = configDir(context);
  if (dir === null) return null;
  return pathFlavour(context.platform ?? process.platform).join(dir, CONFIG_FILE_NAME);
}

/** `GUP_CONFIG=0|false|off|no`: run on defaults, never read nor write the file. */
export function isConfigDisabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[DISABLE_ENV];
  return raw !== undefined && DISABLED_VALUES.has(raw.trim().toLowerCase());
}
