import type { CommandScript, FsNode, SimPlatform, SystemSpec } from "../support/system/types.js";
import { LINUX_HOME, MAC_HOME, WIN_HOME } from "../support/system/os-identity.js";

/**
 * A contract case's machine moved to another OS: the same tools, files and
 * network, with every absolute path spelled the target's way — the home
 * directory swapped for the target's, separators and drive letters
 * converted, Windows executable extensions dropped off Windows. Paths
 * embedded inside a longer argument (a PowerShell script) are left alone:
 * the provider computes its own on the target, and an argv nobody scripted
 * is a failure the simulation explores, not an error.
 */

const HOMES: Readonly<Record<SimPlatform, string>> = {
  win32: WIN_HOME,
  darwin: MAC_HOME,
  linux: LINUX_HOME,
};

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const WINDOWS_DRIVE = /^[A-Za-z]:/;
const WINDOWS_EXECUTABLE = /\.(exe|cmd|bat)$/i;

function isAbsoluteOn(platform: SimPlatform, value: string): boolean {
  return platform === "win32" ? WINDOWS_ABSOLUTE.test(value) : value.startsWith("/");
}

/** The part of `path` under `home`, or null. Windows compares without case. */
function underHome(path: string, home: string, platform: SimPlatform): string | null {
  const isWindows = platform === "win32";
  const [subject, prefix] = isWindows ? [path.toLowerCase(), home.toLowerCase()] : [path, home];
  if (subject === prefix) return "";
  const separator = isWindows ? /^[\\/]/ : /^\//;
  const rest = path.slice(home.length);
  return subject.startsWith(prefix) && separator.test(rest) ? rest.slice(1) : null;
}

function segmentsOf(path: string, platform: SimPlatform): string[] {
  const body = platform === "win32" ? path.replace(WINDOWS_DRIVE, "") : path;
  return body.split(platform === "win32" ? /[\\/]/ : "/").filter((part) => part.length > 0);
}

function join(platform: SimPlatform, root: string, segments: readonly string[]): string {
  const separator = platform === "win32" ? "\\" : "/";
  if (segments.length === 0) return root;
  return `${root.replace(/[\\/]$/, "")}${separator}${segments.join(separator)}`;
}

/** An absolute path of `from`, as the same place on `to`. */
export function rebasePath(path: string, from: SimPlatform, to: SimPlatform): string {
  if (from === to || !isAbsoluteOn(from, path)) return path;
  const inHome = underHome(path, HOMES[from], from);
  const segments = segmentsOf(inHome ?? path, from);
  const root = inHome === null ? (to === "win32" ? "C:\\" : "/") : HOMES[to];
  const rebased = join(to, root, segments);
  return from === "win32" ? rebased.replace(WINDOWS_EXECUTABLE, "") : rebased;
}

function mapValues<T>(
  record: Readonly<Record<string, T>> | undefined,
  map: (value: T) => T,
): Record<string, T> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]));
}

/**
 * The scripts with their path arguments rebased. Two scripts that differed
 * only by a Windows extension become one argv: the first one answers.
 */
function rebaseCommands(
  scripts: readonly CommandScript[],
  path: (value: string) => string,
): CommandScript[] {
  const byArgv = new Map<string, CommandScript>();
  for (const script of scripts) {
    const argv = script.argv.map(path);
    const key = JSON.stringify(argv);
    if (!byArgv.has(key)) byArgv.set(key, { ...script, argv });
  }
  return [...byArgv.values()];
}

export function rebaseSystem(spec: SystemSpec, to: SimPlatform): SystemSpec {
  const from = spec.platform;
  const path = (value: string) => rebasePath(value, from, to);
  const node = (entry: FsNode): FsNode =>
    entry.target === undefined ? entry : { ...entry, target: path(entry.target) };
  const fs =
    spec.fs &&
    Object.fromEntries(Object.entries(spec.fs).map(([key, entry]) => [path(key), node(entry)]));
  const { uid: _uid, ...rest } = spec;
  return {
    ...rest,
    platform: to,
    ...(to !== "win32" && spec.uid !== undefined && { uid: spec.uid }),
    ...(spec.env && { env: mapValues(spec.env, path)! }),
    ...(spec.bin && { bin: mapValues(spec.bin, path)! }),
    ...(spec.commands && { commands: rebaseCommands(spec.commands, path) }),
    ...(fs && { fs }),
  };
}
