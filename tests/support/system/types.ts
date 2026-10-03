import type { Text } from "../fixtures/load.js";

/**
 * The fake machine the providers project runs on. A `SystemSpec` describes a
 * whole machine (OS identity, PATH, processes, network, files) as plain data;
 * `system.load(spec)` installs it behind gup's real boundaries (runner,
 * `fetch`, `node:fs`, `node:os`, `process.platform`).
 */

export type SimPlatform = "win32" | "darwin" | "linux";

export type { Text };

export interface CommandAnswer {
  readonly stdout?: Text;
  readonly stderr?: Text;
  /** Default 0. Non-zero sets `RunResult.failed`. */
  readonly exitCode?: number;
}

export interface CommandScript extends CommandAnswer {
  /** Exact argv, command name first: `["tofu", "version"]`. */
  readonly argv: readonly string[];
  /** Answers for the 2nd, 3rd… identical call; the last one repeats. */
  readonly then?: readonly CommandAnswer[];
  /**
   * The answer once an install has run on this machine: a provider that
   * re-queries after its upgrade (pkgin, MSYS2) sees the upgraded state.
   * Takes precedence over `then`.
   */
  readonly afterInstall?: CommandAnswer;
}

export interface HttpRoute {
  /** Exact URL, query string included. */
  readonly url: string;
  readonly method?: "GET" | "POST";
  /** Default 200. */
  readonly status?: number;
  readonly json?: unknown;
  readonly body?: Text;
  readonly headers?: Readonly<Record<string, string>>;
  /** Where redirects ended (`Response.url`); default: the requested URL. */
  readonly finalUrl?: string;
}

export interface FsNode {
  readonly kind: "file" | "dir" | "symlink";
  readonly content?: Text;
  /** Symlink target (absolute, or relative to the link's directory), followed by `realpath()`. */
  readonly target?: string;
  /** POSIX exec bit, for `access(X_OK)`. */
  readonly executable?: boolean;
}

export interface SystemSpec {
  readonly platform: SimPlatform;
  /** Merged over the platform's scrubbed default env. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Binaries on PATH: bare name → absolute path. Answers `commandExists`,
   * `whichFirst`, `where` and `which`; each path exists as an executable file.
   */
  readonly bin?: Readonly<Record<string, string>>;
  readonly commands?: readonly CommandScript[];
  readonly http?: readonly HttpRoute[];
  /** Absolute path → node. Parents are implied. */
  readonly fs?: Readonly<Record<string, FsNode>>;
  /** `isElevated()`. Default false. */
  readonly elevated?: boolean;
  /** `process.getuid()` on POSIX; absent on win32. Default 501 (darwin), 1000 (linux). */
  readonly uid?: number;
  /** Every probe succeeds: every binary present, every path exists, every URL answers 404. */
  readonly permissive?: boolean;
}

export type SpawnFaultMode = "exit-1" | "empty" | "garbage" | "rejects" | "timeout";
export type HttpFaultMode = "status-500" | "rate-limited" | "network" | "abort" | "bad-json";
export type FsFaultMode = "missing" | "eacces";

export type Fault =
  | { readonly on: "spawn"; readonly argv: readonly string[]; readonly mode: SpawnFaultMode }
  | { readonly on: "http"; readonly url: string; readonly mode: HttpFaultMode }
  | { readonly on: "fs"; readonly path: string; readonly mode: FsFaultMode };

export interface InstallAnswer {
  readonly exitCode?: number;
  /** The runner itself rejects (its argv barrier refused the call). */
  readonly rejects?: boolean;
  /** The install timeout fired: failed, `timedOut`, reported by `consumeInterrupt`. */
  readonly timedOut?: boolean;
  /** The user skipped it (Ctrl+C): failed, `aborted`, reported by `consumeInterrupt`. */
  readonly aborted?: boolean;
}

export interface SpawnRecord {
  readonly mode: "run" | "inherit";
  readonly argv: readonly string[];
  readonly shell: boolean;
  readonly cwd?: string;
  /** The wall-clock cap (ms) the code under test asked the runner for, if any. */
  readonly timeout?: number;
  /** The environment the code under test handed the child, when it passed one. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface RequestRecord {
  readonly method: string;
  readonly url: string;
  /** The body the code under test sent, when it is text (a POSTed query). */
  readonly body?: string;
}

export interface Trace {
  readonly spawns: readonly SpawnRecord[];
  readonly requests: readonly RequestRecord[];
  /** Paths read through the fake fs, as the code under test spelled them. */
  readonly fsReads: readonly string[];
}
