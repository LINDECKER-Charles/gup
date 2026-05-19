export interface OutdatedPackage {
  /** Stable identifier within the provider (used for targeted update). */
  id: string;
  /** Human-readable name shown in tables (defaults to id when omitted). */
  name?: string;
  current: string;
  latest: string;
  /** Optional extra info ("pinned", "unknown", "source: msstore"...). */
  note?: string;
  /**
   * True when the provider knows ahead of time that calling update() will
   * return a `skipped` outcome — no automatic action possible. Excluded
   * from "Update all" by default and surfaced separately so the user can
   * act on them manually.
   */
  manual?: boolean;
}

export interface UpdateOutcome {
  id: string;
  success: boolean;
  /**
   * True when the provider intentionally deferred the update (e.g. requires
   * a manual download or a GUI tool like JetBrains Toolbox). Distinguishes
   * "couldn't run" from "ran and failed".
   */
  skipped?: boolean;
  /** Free-form message shown to the user (failure cause or skip reason). */
  message?: string;
  /**
   * Set by the provider when a failure could plausibly succeed if retried
   * with UpdateOptions.force (typical winget case: installer hash mismatch,
   * locale-specific manifest, app currently running). The CLI surfaces these
   * as an opt-in retry pass so the user explicitly authorizes the bypass.
   */
  retryable?: boolean;
}

export interface UpdateOptions {
  /**
   * Bypass the provider's installer integrity checks (e.g. winget --force).
   * Off by default; only set after explicit user confirmation since it
   * disables hash verification.
   */
  force?: boolean;
  /**
   * Uninstall the currently installed version before applying the upgrade
   * (winget --uninstall-previous). Required when the new manifest uses a
   * different installer technology than the installed one, or when winget
   * reports "no applicable upgrade". Destructive: per-app configuration
   * not stored under %APPDATA% (or equivalent) may be lost.
   */
  uninstallPrevious?: boolean;
  /**
   * Last-resort fallback: invoke uninstall then install as two separate
   * commands instead of relying on `winget upgrade --uninstall-previous`.
   * Needed when `--uninstall-previous` does not trigger (typically when the
   * currently-installed version is "Unknown" to winget, or when the upgrade
   * is refused with "no applicable upgrade" before the uninstall stage).
   * Bypasses the upgrade chain entirely. Same destructiveness as
   * uninstallPrevious — per-app config outside %APPDATA% may be lost.
   */
  reinstall?: boolean;
}

export interface ProviderScanResult {
  providerId: string;
  available: boolean;
  packages: OutdatedPackage[];
  /** Set when scan failed despite the provider being available. */
  error?: string;
}

export interface Provider {
  readonly id: string;
  readonly displayName: string;
  /** Hint shown by `gup doctor` when not installed. */
  readonly installHint?: string;
  /**
   * Mark as `true` for providers whose scan involves slow per-package HTTP
   * calls or filesystem walks. Skipped by `gup --fast` / "Fast mode" toggle.
   * Declarative — no centralized opt-in list to maintain.
   */
  readonly slow?: boolean;

  isAvailable(): Promise<boolean>;
  listOutdated(): Promise<OutdatedPackage[]>;
  update(packageId: string, options?: UpdateOptions): Promise<UpdateOutcome>;
  updateAll(
    packages: OutdatedPackage[],
    options?: UpdateOptions,
  ): Promise<UpdateOutcome[]>;
}
