import { existsSync, realpathSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { InheritRequest } from "../process/inherit-sink.js";
import { encodePayload, PAYLOAD_VERSION, type TrampolinePayload } from "./trampoline-payload.js";

/**
 * node-pty never spawns an installer itself: its Windows spawn resolves
 * neither PATHEXT (`npm`, `scoop` are `.cmd` shims) nor cmd.exe's escaping
 * rules. It spawns a fixed trampoline — node, the `pty-exec` bundle and one
 * base64url argument — and the trampoline hands the request to the unchanged
 * `runInherit`, so execa resolves and escapes the command exactly as it does
 * without a PTY. One security model for both modes.
 */

/** Where the trampoline is, and the node flags it needs (the tsx loader in development). */
export interface TrampolineLocation {
  readonly script: string;
  readonly execArgv: readonly string[];
}

/** What locates the trampoline: the running CLI's script and node flags. */
export interface TrampolineHost {
  readonly argv1: string | undefined;
  readonly execArgv: readonly string[];
}

/** The command node-pty runs. */
export interface TrampolineLaunch {
  readonly file: string;
  readonly args: readonly string[];
}

/** `dist/pty-exec.js` beside `dist/cli.js`, `src/pty-exec.ts` beside `src/cli.ts`. */
const TRAMPOLINE_NAME = "pty-exec";

/** Node flags that take their value as the next argument when written without `=`. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--import",
  "--require",
  "-r",
  "--loader",
  "--experimental-loader",
  "--disable-warning",
]);

/**
 * The trampoline, as a sibling of the real CLI file. `realpath` follows the
 * npm global symlink (`/usr/local/bin/gup` → `…/dist/cli.js`); the extension
 * follows the CLI, so `tsx src/cli.ts` finds `src/pty-exec.ts`. Null when the
 * file is not there (a broken install, gup imported as a library).
 */
export function locateTrampoline(host: TrampolineHost = runningHost()): TrampolineLocation | null {
  if (!host.argv1) return null;
  try {
    const cli = realpathSync(host.argv1);
    const script = join(dirname(cli), `${TRAMPOLINE_NAME}${extname(cli)}`);
    return existsSync(script) ? { script, execArgv: keptExecArgv(host.execArgv) } : null;
  } catch {
    return null;
  }
}

/** node, its kept flags, the trampoline and the encoded request — nothing else. */
export function trampolineLaunch(
  request: InheritRequest,
  location: TrampolineLocation,
): TrampolineLaunch {
  const payload: TrampolinePayload = {
    v: PAYLOAD_VERSION,
    command: request.command,
    args: request.args,
    ...(request.cwd !== undefined && { cwd: request.cwd }),
    ...(request.shell !== undefined && { shell: request.shell }),
  };
  return {
    file: process.execPath,
    args: [...location.execArgv, location.script, encodePayload(payload)],
  };
}

function runningHost(): TrampolineHost {
  return { argv1: process.argv[1], execArgv: process.execArgv };
}

/**
 * The node flags the trampoline inherits: module loaders (`--import`,
 * `--require`, `--loader`, so `tsx` keeps working in development),
 * `--experimental-*` switches and warning filters. Everything else is
 * dropped — `--inspect*` and `--debug*` above all, which would fight the
 * parent for the debug port.
 */
function keptExecArgv(execArgv: readonly string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < execArgv.length; index++) {
    const flag = execArgv[index] ?? "";
    if (!isKeptFlag(flag)) continue;
    kept.push(flag);
    const value = execArgv[index + 1];
    if (VALUE_FLAGS.has(flag) && value !== undefined) {
      kept.push(value);
      index++;
    }
  }
  return kept;
}

function isKeptFlag(flag: string): boolean {
  const name = flag.split("=", 1)[0] ?? "";
  return (
    VALUE_FLAGS.has(name) ||
    name === "--no-warnings" ||
    name.startsWith("--experimental-") ||
    name.startsWith("--disable-warning")
  );
}
