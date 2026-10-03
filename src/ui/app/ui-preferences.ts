import type { ViewId } from "./view-definition.js";

/**
 * How the interactive menu behaves, as the user set it. The menu reads these
 * through {@link uiPreferences} and redraws when they change; where they come
 * from (the persisted settings) is installed at startup by the settings CLI
 * module. Without one, the defaults apply — gup's behaviour out of the box.
 */

/** Package order inside each provider: as scanned, by name, or biggest version jump first. */
export type PackageSort = "provider" | "name" | "bump";
/** The Paquets "Note" column: shown when the panel is wide enough, or never. */
export type NoteColumn = "auto" | "hidden";

export interface UiPreferences {
  /** The view in front when the menu opens. */
  readonly launchView: ViewId;
  readonly scanOnLaunch: boolean;
  /** Ask before an update starts. */
  readonly confirmBeforeUpdate: boolean;
  /** After an update, rescan everything rather than drop the updated packages. */
  readonly rescanAfterUpdate: boolean;
  readonly packageSort: PackageSort;
  readonly noteColumn: NoteColumn;
  /** Spinners turn; off, they stand still (redraws go on). */
  readonly animations: boolean;
  /** Notify the terminal when a long update ends. */
  readonly notifyOnDone: boolean;
  /** List providers foreign to this OS (greyed) in the Providers view. */
  readonly showIncompatibleProviders: boolean;
  /** The menu's scan settings; `gup list` / `gup update` keep their own flags. */
  readonly scan: { readonly fast: boolean; readonly filter: readonly string[] };
}

export interface UiPreferencesSource {
  current(): UiPreferences;
  /** `listener` runs after any preference changed. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = Object.freeze({
  launchView: "scan",
  scanOnLaunch: true,
  confirmBeforeUpdate: true,
  rescanAfterUpdate: false,
  packageSort: "provider",
  noteColumn: "auto",
  animations: true,
  notifyOnDone: false,
  showIncompatibleProviders: true,
  scan: Object.freeze({ fast: false, filter: Object.freeze([]) }),
});

const DEFAULT_SOURCE: UiPreferencesSource = {
  current: () => DEFAULT_UI_PREFERENCES,
  subscribe: () => () => {},
};

let source: UiPreferencesSource = DEFAULT_SOURCE;

/** Composition only (a CLI module's `beforeAction`); `null` restores the defaults. */
export function setUiPreferencesSource(next: UiPreferencesSource | null): void {
  source = next ?? DEFAULT_SOURCE;
}

export function uiPreferences(): UiPreferencesSource {
  return source;
}
