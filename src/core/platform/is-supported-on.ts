import type { PlatformScoped } from "./types.js";

/**
 * True when `subject` declares no restriction, or lists `platform`.
 *
 * The default is evaluated per call, so a test that redefines
 * `process.platform` sees its own value. An empty set means "supported
 * nowhere"; only the named `PLATFORMS` sets are ever declared.
 */
export function isSupportedOn(
  subject: PlatformScoped,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return subject.platforms === undefined || subject.platforms.includes(platform);
}
