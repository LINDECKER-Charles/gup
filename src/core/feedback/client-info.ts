import type { Locale } from "../i18n/locale.js";
import { gupVersion } from "../version.js";

/**
 * What a batch says about the gup that sent it (`client` in
 * `docs/development/feedback-service.md`), and what the feedback form is
 * prefilled with: enough to read its journals — gup's version, the
 * platform, the CPU architecture, Node's version and the interface
 * language — and nothing that identifies the user or the machine.
 */

export interface ClientInfo {
  readonly gupVersion: string;
  /** `win32`, `darwin`, `linux` or `other`. */
  readonly platform: string;
  readonly arch: string;
  /** Node's version without its `v`: `26.10.0`. */
  readonly node: string;
  readonly locale: Locale;
}

const KNOWN_PLATFORMS: ReadonlySet<string> = new Set(["win32", "darwin", "linux"]);
const OTHER_PLATFORM = "other";

export function currentClientInfo(
  locale: Locale,
  platform: NodeJS.Platform = process.platform,
): ClientInfo {
  return {
    gupVersion: gupVersion(),
    platform: KNOWN_PLATFORMS.has(platform) ? platform : OTHER_PLATFORM,
    arch: process.arch,
    node: process.versions.node,
    locale,
  };
}
