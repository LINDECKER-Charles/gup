import type { PlatformSet } from "../types.js";

/**
 * Every value `process.platform` can take. A Record rather than an array so a
 * platform added to `@types/node` is a compile error here instead of a silent
 * gap in `notWindows`.
 */
const EVERY_PLATFORM: Readonly<Record<NodeJS.Platform, true>> = {
  aix: true,
  android: true,
  cygwin: true,
  darwin: true,
  freebsd: true,
  haiku: true,
  linux: true,
  netbsd: true,
  openbsd: true,
  sunos: true,
  win32: true,
};

const ALL_PLATFORMS = Object.keys(EVERY_PLATFORM) as NodeJS.Platform[];

/**
 * The only sets a provider may declare. Named, so a declaration reads as
 * intent and stays greppable: the landing build counts per-OS support with a
 * regex over `readonly platforms = PLATFORMS.<set>;`.
 */
export const PLATFORMS: Readonly<Record<"windows" | "macos" | "notWindows", PlatformSet>> =
  Object.freeze({
    windows: Object.freeze(["win32"] as const),
    macos: Object.freeze(["darwin"] as const),
    /** What `if (process.platform === "win32") return false` used to mean. */
    notWindows: Object.freeze(ALL_PLATFORMS.filter((platform) => platform !== "win32")),
  });
