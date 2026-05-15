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
  update(packageId: string): Promise<UpdateOutcome>;
  updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]>;
}
