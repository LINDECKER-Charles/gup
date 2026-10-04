import { localized } from "../i18n/localized.js";
import type { PlatformSet } from "../types.js";

/**
 * Display vocabulary for platforms, in the interface's languages: the OS name
 * and the "X only" badge are two halves of one vocabulary, so they share this
 * module. The OS names are proper names, the same in every language.
 */

const NAMES: Partial<Record<NodeJS.Platform, string>> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

/** Order labels are listed in, whatever order a set was declared in. */
const DISPLAY_ORDER: PlatformSet = ["win32", "darwin", "linux"];

const LABEL_SEPARATOR = "/";

const PLATFORM_LABELS = localized({
  en: { exclusive: (names: string) => `${names} only` },
  fr: { exclusive: (names) => `${names} uniquement` },
});

/** "Windows" / "macOS" / "Linux", or the raw platform id for the rest. */
export function platformName(platform: NodeJS.Platform): string {
  return NAMES[platform] ?? platform;
}

/**
 * "Windows only", "macOS/Linux only"… Only the named platforms are listed
 * when the set holds any, so `notWindows` reads `macOS/Linux` rather than
 * enumerating the BSDs gup is never installed on.
 */
export function supportLabel(platforms: PlatformSet): string {
  const named = DISPLAY_ORDER.filter((platform) => platforms.includes(platform));
  const labels = (named.length > 0 ? named : platforms).map(platformName);
  return PLATFORM_LABELS.exclusive(labels.join(LABEL_SEPARATOR));
}
