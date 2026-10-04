import type { MenuState } from "../../commands/menu-state.js";
import type { SelectedPackage } from "../../core/types.js";
import type { UpdateReport } from "../../core/update/update-report.js";
import type { DialogLayer } from "../tui/dialog.js";
import type { Screen } from "../tui/screen-host.js";
import type { MenuController, SessionExit } from "./menu-session.js";
import { outsideLauncher } from "./outside-launcher.js";
import type { UiPreferences } from "./ui-preferences.js";
import type { ResultAction, Takeover, TakeoverSurface, ViewId } from "./view-definition.js";

/**
 * Where the menu's updates run is pluggable: the foundation runs them
 * outside the screen (the session ends, installers get the plain terminal);
 * the embedded-terminal module installs a launcher that runs them inside it.
 * Views only ever call `context.updates.launch(...)`.
 */

export interface LaunchRequest {
  /** The schedule this update belongs to ("run now"), recorded in the history. */
  readonly scheduleId?: string;
  /** The view to come back to afterwards; default Paquets. */
  readonly returnTo?: ViewId;
}

export interface UpdateLauncher {
  /** True while an update runs inside the screen. */
  readonly isRunning: boolean;
  /**
   * Update `packages`. Never rejects. Resolves with the report of an update
   * that ran inside the screen, or null when the user declined, when a scan
   * of the session is running (nothing starts then), or when the update runs
   * outside the screen (the session then ends).
   */
  launch(
    packages: readonly SelectedPackage[],
    request?: LaunchRequest,
  ): Promise<UpdateReport | null>;
}

/** What a launcher gets from the session it serves. */
export interface LauncherContext {
  readonly screen: Screen;
  readonly dialogs: DialogLayer;
  readonly state: MenuState;
  readonly controller: MenuController;
  readonly preferences: () => UiPreferences;
  /** True while a scan of the session runs: package managers are busy, no update starts. */
  isScanning(): boolean;
  /** The keys the views add to the results of an update run inside the screen. */
  readonly resultActions: () => readonly ResultAction[];
  takeOver(start: (surface: TakeoverSurface) => Takeover): () => void;
  /** End the session: quit, or run an update on the plain terminal. */
  exit(exit: SessionExit): void;
  /**
   * An update ran inside the screen: drop the updated packages or rescan,
   * per the preferences, and bring `returnTo` (default Paquets) to the front.
   */
  afterUpdate(report: UpdateReport, returnTo?: ViewId): void;
}

export type LauncherFactory = (context: LauncherContext) => UpdateLauncher;

let factory: LauncherFactory | null = null;

/** Composition only (a CLI module's `beforeAction`); `null` restores the outside launcher. */
export function setLauncherFactory(next: LauncherFactory | null): void {
  factory = next;
}

export function launcherFactory(): LauncherFactory {
  return factory ?? outsideLauncher;
}
