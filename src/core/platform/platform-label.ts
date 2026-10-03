import type { PlatformSet } from "../types.js";

/**
 * French display vocabulary for platforms: the OS name and the "X uniquement"
 * badge are two halves of one vocabulary, so they share this module.
 */

const NAMES: Partial<Record<NodeJS.Platform, string>> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

/** Order labels are listed in, whatever order a set was declared in. */
const DISPLAY_ORDER: PlatformSet = ["win32", "darwin", "linux"];

const LABEL_SEPARATOR = "/";
const EXCLUSIVE_SUFFIX = "uniquement";

/** "Windows" / "macOS" / "Linux", or the raw platform id for the rest. */
export function platformName(platform: NodeJS.Platform): string {
  return NAMES[platform] ?? platform;
}

/**
 * "Windows uniquement", "macOS/Linux uniquement"… Only the named platforms
 * are listed when the set holds any, so `notWindows` reads `macOS/Linux`
 * rather than enumerating the BSDs gup is never installed on.
 */
export function supportLabel(platforms: PlatformSet): string {
  const named = DISPLAY_ORDER.filter((platform) => platforms.includes(platform));
  const labels = (named.length > 0 ? named : platforms).map(platformName);
  return `${labels.join(LABEL_SEPARATOR)} ${EXCLUSIVE_SUFFIX}`;
}
