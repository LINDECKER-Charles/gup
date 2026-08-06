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
