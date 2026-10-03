import type { PlatformSet, Provider } from "../types.js";

/**
 * Shapes of the platform concern: what can be restricted to some platforms,
 * and the plain views listings and action paths consume.
 */

/** Anything that can be restricted to some platforms: a Provider, a self-update target. */
export interface PlatformScoped {
  readonly platforms?: PlatformSet;
}

/** Plain, JSON-serialisable view of a provider for listings (TUI, doctor, reports). */
export interface ProviderSummary {
  readonly id: string;
  readonly displayName: string;
  readonly installHint?: string;
  readonly platforms?: PlatformSet;
}

/** Every registered provider sorted into the three listing groups of one platform. */
export interface ProviderStatusReport {
  /** Platform the report was computed on — labels the incompatible group. */
  readonly platform: NodeJS.Platform;
  readonly detected: readonly ProviderSummary[];
  readonly missing: readonly ProviderSummary[];
  readonly incompatible: readonly ProviderSummary[];
}

/** A provider id resolved for an action, or the ready-to-print reason it cannot be. */
export type ProviderLookup =
  | { readonly isFound: true; readonly provider: Provider }
  | { readonly isFound: false; readonly error: string };
