/**
 * Platform-aware `installHint` selection.
 *
 * `gup doctor` prints a provider's `installHint` when the tool is missing.
 * A hardcoded `winget install …` is actively unhelpful on a Mac, so providers
 * declare one hint per platform and let this pick the right one at
 * construction time (providers are instantiated once, at registry load, in a
 * process whose platform never changes).
 *
 * Typical shape — Homebrew covers macOS and Linuxbrew, so it usually belongs
 * in `fallback` rather than being repeated:
 *
 *   readonly installHint = pickInstallHint({
 *     win32: "winget install Kubernetes.kubectl",
 *     fallback: "brew install kubernetes-cli",
 *   });
 *
 * A hint with words around its command ("Install Node.js: https://nodejs.org")
 * is in the interface's language, which startup chooses after the registry
 * has loaded: such a provider declares a getter instead, so the words are
 * picked when the hint is shown.
 *
 *   get installHint(): string {
 *     return pickInstallHint({
 *       win32: MANUAL_STEPS.install("Node.js", "https://nodejs.org"),
 *       fallback: "brew install node",
 *     });
 *   }
 *
 * A provider that declares `platforms` is only ever listed as missing on
 * those platforms, so it declares no key for the others (a plain string when
 * one hint is left). tests/core/platform/platform-gate-source.test.ts checks it.
 */
export interface PlatformInstallHints {
  /** Shown on Windows. */
  win32?: string;
  /** Shown on macOS. */
  darwin?: string;
  /** Shown on Linux. */
  linux?: string;
  /**
   * Shown when the running platform has no dedicated entry above. Mandatory
   * so a hint is never empty — including on platforms nobody enumerated
   * (FreeBSD, …) where a generic upstream URL is still better than nothing.
   */
  fallback: string;
}

export function pickInstallHint(hints: PlatformInstallHints): string {
  switch (process.platform) {
    case "win32":
      return hints.win32 ?? hints.fallback;
    case "darwin":
      return hints.darwin ?? hints.fallback;
    case "linux":
      return hints.linux ?? hints.fallback;
    default:
      return hints.fallback;
  }
}
