import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { FIXTURE_CLOCK } from "../fixtures/clock.js";

/** gup's own settings and data overrides: none of the developer's may reach a screenshot. */
const GUP_VARIABLE = /^GUP_/i;

/** Every directory gup reads or writes, each moved to its own folder in the sandbox. */
const DATA_DIRS: Readonly<Record<string, string>> = {
  GUP_HISTORY_DIR: "history",
  GUP_CONFIG_DIR: "config",
  GUP_LOG_DIR: "logs",
  GUP_REPORT_DIR: "reports",
  GUP_SCHEDULER_DIR: "scheduler",
};

/**
 * The terminal a screenshot pretends to run in, whatever the host's: a
 * UTF-8 locale and a 256-colour terminal resolve the glyph mode to unicode on
 * every OS (a CI runner with `TERM=dumb` or a POSIX `C` locale would draw
 * ASCII). The locale is the one the generator's workers start in, so ICU
 * sees the same one whenever it first reads it. `NO_COLOR` is the host's
 * choice, never the screenshot's.
 */
const TERMINAL_ENV: Readonly<Record<string, string | undefined>> = {
  TERM: "xterm-256color",
  LC_ALL: FIXTURE_CLOCK.locale,
  NO_COLOR: undefined,
};

/**
 * Isolate the process from the developer's machine: drop every `GUP_*`
 * variable, point gup's data directories at a fresh temporary tree (empty, so
 * the app runs on its defaults) and pin the terminal identity. Returns the
 * function that restores the environment and deletes the tree.
 */
export function enterSandbox(): () => void {
  const root = mkdtempSync(join(tmpdir(), "gup-screens-"));
  for (const name of Object.keys(process.env).filter((key) => GUP_VARIABLE.test(key))) {
    vi.stubEnv(name, undefined);
  }
  for (const [name, dir] of Object.entries(DATA_DIRS)) vi.stubEnv(name, join(root, dir));
  for (const [name, value] of Object.entries(TERMINAL_ENV)) vi.stubEnv(name, value);
  return () => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  };
}
