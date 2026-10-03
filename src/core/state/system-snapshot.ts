import { arch, release } from "node:os";
import { redactText } from "../log/redact.js";
import { gupVersion } from "../version.js";

/**
 * What a bug report needs to know about the machine gup runs on: versions,
 * platform, whether a terminal is attached, and the handful of environment
 * variables that change gup's behaviour. Written at the start of every debug
 * log session and into the diagnostic archive.
 *
 * The environment is read through an allowlist, never wholesale: tokens,
 * proxies with credentials and paths naming the user live there. Values go
 * through the same redaction as the log (home directory shortened to `~`).
 */

/** Variables whose value is recorded: gup's own switches and the terminal's identity. */
const RECORDED_ENV = [
  "GUP_ASCII",
  "GUP_CONFIG",
  "GUP_CONFIG_DIR",
  "GUP_HISTORY",
  "GUP_HISTORY_DIR",
  "GUP_INSTALL_TIMEOUT",
  "GUP_LOG_DIR",
  "GUP_LOG_LEVEL",
  "GUP_LOG_RETENTION_DAYS",
  "GUP_NONINTERACTIVE",
  "GUP_PTY",
  "GUP_REPORT_DIR",
  "GUP_SCHEDULER_DIR",
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "CI",
  "WSL_DISTRO_NAME",
] as const;

/** Variables whose presence matters but whose value is an opaque id. */
const PRESENCE_ONLY_ENV = ["WT_SESSION"] as const;
const PRESENT = "present";

export interface SystemSnapshot {
  readonly gup: string;
  readonly node: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly osRelease: string;
  readonly tty: { readonly stdin: boolean; readonly stdout: boolean };
  readonly env: { readonly [name: string]: string };
}

export function systemSnapshot(env: NodeJS.ProcessEnv = process.env): SystemSnapshot {
  return {
    gup: gupVersion(),
    node: process.version,
    platform: process.platform,
    arch: arch(),
    osRelease: release(),
    tty: { stdin: process.stdin.isTTY === true, stdout: process.stdout.isTTY === true },
    env: recordedEnv(env),
  };
}

function recordedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const recorded: [string, string][] = [];
  for (const name of RECORDED_ENV) {
    const value = env[name];
    if (value !== undefined) recorded.push([name, redactText(value)]);
  }
  for (const name of PRESENCE_ONLY_ENV) {
    if (env[name] !== undefined) recorded.push([name, PRESENT]);
  }
  return Object.fromEntries(recorded);
}
