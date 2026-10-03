import { HOST_PLATFORM, restorePlatform, setPlatform } from "../platform.js";
import { SHARED_ENV_KEYS } from "../test-env.js";
import type { SimPlatform } from "./types.js";

/**
 * OS identity of the fake machine: `process.platform`, a scrubbed
 * per-platform `process.env`, `process.getuid` and the `node:os` answers that
 * derive from them. Nothing of the developer's real environment reaches a
 * provider under test.
 */

export const WIN_HOME = "C:\\Users\\u";
export const MAC_HOME = "/Users/u";
export const LINUX_HOME = "/home/u";

/** `process.getuid()` of a regular user on each POSIX simulation. */
const DEFAULT_UID: Readonly<Record<Exclude<SimPlatform, "win32">, number>> = {
  darwin: 501,
  linux: 1000,
};

const DEFAULT_ENV: Readonly<Record<SimPlatform, Readonly<Record<string, string>>>> = {
  win32: {
    PATH: "C:\\Windows\\system32;C:\\Windows;C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    SystemDrive: "C:",
    SystemRoot: "C:\\Windows",
    USERPROFILE: WIN_HOME,
    LOCALAPPDATA: `${WIN_HOME}\\AppData\\Local`,
    APPDATA: `${WIN_HOME}\\AppData\\Roaming`,
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    ProgramData: "C:\\ProgramData",
    TEMP: `${WIN_HOME}\\AppData\\Local\\Temp`,
  },
  darwin: {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: MAC_HOME,
    USER: "u",
    TMPDIR: "/var/folders/u/T",
  },
  linux: {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: LINUX_HOME,
    USER: "u",
  },
};

/** Host variables a simulated env keeps: vitest's own, and the shared test env. */
function isCarriedOver(key: string): boolean {
  return key.startsWith("VITEST") || key === "NODE_ENV" || SHARED_ENV_KEYS.includes(key);
}

const REAL_SLOT = Symbol.for("gup.tests.realIdentity");

interface RealIdentity {
  readonly env: NodeJS.ProcessEnv;
  readonly getuid: PropertyDescriptor | undefined;
}

/**
 * The worker's real env object and `getuid`, captured once per worker (as
 * HOST_PLATFORM is): modules are re-evaluated per test file, and a simulated
 * env must never be mistaken for the real one.
 */
const REAL: RealIdentity = ((globalThis as { [REAL_SLOT]?: RealIdentity })[REAL_SLOT] ??= {
  env: process.env,
  getuid: Object.getOwnPropertyDescriptor(process, "getuid"),
});

/** The platform a reset machine runs: the host's, or linux for any other POSIX host. */
export const HOST_SIM_PLATFORM: SimPlatform =
  HOST_PLATFORM === "win32" || HOST_PLATFORM === "darwin" ? HOST_PLATFORM : "linux";

/**
 * Windows environment variables are case-insensitive (`Path` is `PATH`): a
 * simulated win32 env answers the same way, and keeps the spelling it was
 * first given for enumeration.
 */
function caseInsensitiveEnv(initial: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  // Upper-cased name → [name as first spelled, value].
  const store = new Map<string, readonly [string, string]>();
  const entryOf = (key: string | symbol) =>
    typeof key === "string" ? store.get(key.toUpperCase()) : undefined;
  for (const [key, value] of Object.entries(initial)) store.set(key.toUpperCase(), [key, value]);
  return new Proxy({} as NodeJS.ProcessEnv, {
    get: (_target, key) => entryOf(key)?.[1],
    set: (_target, key, value: unknown) => {
      if (typeof key !== "string") return false;
      store.set(key.toUpperCase(), [entryOf(key)?.[0] ?? key, String(value)]);
      return true;
    },
    has: (_target, key) => entryOf(key) !== undefined,
    deleteProperty: (_target, key) => {
      if (typeof key === "string") store.delete(key.toUpperCase());
      return true;
    },
    ownKeys: () => [...store.values()].map(([key]) => key),
    getOwnPropertyDescriptor: (_target, key) => {
      const entry = entryOf(key);
      if (!entry) return undefined;
      return { value: entry[1], writable: true, enumerable: true, configurable: true };
    },
  });
}

/** The scrubbed env of `platform`, with `overrides` merged on top. */
function simulatedEnv(
  platform: SimPlatform,
  overrides: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const carried = Object.entries(REAL.env).filter(
    (entry): entry is [string, string] => isCarriedOver(entry[0]) && entry[1] !== undefined,
  );
  return { ...Object.fromEntries(carried), ...DEFAULT_ENV[platform], ...overrides };
}

export interface Identity {
  readonly platform: SimPlatform;
  readonly env?: Readonly<Record<string, string>>;
  readonly uid?: number;
}

/** Become `identity`: platform, env and uid, until {@link restoreIdentity}. */
export function applyIdentity(identity: Identity): void {
  const values = simulatedEnv(identity.platform, identity.env);
  setPlatform(identity.platform);
  process.env = identity.platform === "win32" ? caseInsensitiveEnv(values) : { ...values };
  if (identity.platform === "win32") {
    Reflect.deleteProperty(process, "getuid");
    return;
  }
  const uid = identity.uid ?? DEFAULT_UID[identity.platform];
  const getuid = (): number => uid;
  Object.defineProperty(process, "getuid", { value: getuid, configurable: true, writable: true });
}

/** Back to the worker's real platform, env and uid. */
export function restoreIdentity(): void {
  restorePlatform();
  process.env = REAL.env;
  if (REAL.getuid) Object.defineProperty(process, "getuid", REAL.getuid);
  else Reflect.deleteProperty(process, "getuid");
}

function homeOf(platform: SimPlatform): string {
  if (platform === "win32") return process.env["USERPROFILE"] || WIN_HOME;
  return process.env["HOME"] || (platform === "darwin" ? MAC_HOME : LINUX_HOME);
}

/** Node's `os.tmpdir()` rules, applied to the simulated env. */
function tmpdirOf(platform: SimPlatform): string {
  const env = process.env;
  if (platform === "win32") {
    const dir = env["TEMP"] || env["TMP"] || `${env["SystemRoot"] || "C:\\Windows"}\\temp`;
    return dir.length > 3 ? dir.replace(/\\+$/, "") : dir;
  }
  const dir = env["TMPDIR"] || env["TMP"] || env["TEMP"] || "/tmp";
  return dir.length > 1 ? dir.replace(/\/+$/, "") : dir;
}

function currentSimPlatform(): SimPlatform {
  const platform = process.platform;
  return platform === "win32" || platform === "darwin" ? platform : "linux";
}

/** The `node:os` functions that answer from the simulated identity. */
export const fakeOs = {
  homedir: (): string => homeOf(currentSimPlatform()),
  tmpdir: (): string => tmpdirOf(currentSimPlatform()),
  platform: (): NodeJS.Platform => process.platform,
};
