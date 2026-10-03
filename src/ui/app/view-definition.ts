import type { BoxRenderable } from "@opentui/core";
import type { MenuState } from "../../commands/menu-state.js";
import type { Panel } from "../panels/panel.js";
import type { ScanObserver } from "../panels/scan-panel.js";
import type { DialogLayer } from "../tui/dialog.js";
import type { KeyPress, Screen } from "../tui/screen-host.js";
import type { Tone } from "../tui/styled-lines.js";
import type { UpdateLauncher } from "./update-launcher.js";

/**
 * How a feature adds a view to the interactive menu without editing the
 * session or the sidebar: a {@link ViewDefinition} (one factory per view
 * module, ports as parameters) registered by one line in
 * `commands/menu-views.ts`. The session builds the sidebar from the
 * definitions, routes keys and draws; each view gets a {@link ViewContext}
 * to reach the rest of the menu.
 */

/** Every menu view, present or planned: work views first, information and settings after. */
export type ViewId = "scan" | "packages" | "schedules" | "providers" | "journal" | "options";

/** A short count after a sidebar label ("12" next to Paquets). */
export interface SidebarBadge {
  readonly text: string;
  readonly tone: Tone;
}

/** A key handed to a takeover: it may stop the terminal's default handling. */
export type TakeoverKey = KeyPress & { preventDefault(): void };

/** What a full-body screen (the run view) draws on while it holds the menu. */
export interface TakeoverSurface {
  readonly screen: Screen;
  /** The chrome's body, emptied of the sidebar and the main panel. */
  readonly body: BoxRenderable;
  readonly dialogs: DialogLayer;
  setFacts(facts: readonly string[]): void;
  setHints(hints: string): void;
}

/** A full-body screen: it gets every key after the dialogs, and a frame tick. */
export interface Takeover {
  press(key: TakeoverKey): void;
  tick(): void;
  draw(): void;
}

/** The menu as a view sees it. */
export interface ViewContext {
  readonly screen: Screen;
  readonly state: MenuState;
  readonly dialogs: DialogLayer;
  /** Updates the given packages; the launcher in effect decides where (outside, in the screen). */
  readonly updates: UpdateLauncher;
  displayName(providerId: string): string;
  redraw(): void;
  /** Bring a registered view to the front (ignored for one that is not registered). */
  show(view: ViewId): void;
  /** A user-requested scan: the Scan view comes to the front (ignored while one runs). */
  rescan(): void;
  /**
   * `listener` runs whenever `state.scans` holds results the views have not
   * seen: a scan finished, an update pruned the packages it updated, or a
   * session starts on the previous results without scanning.
   */
  onScansChanged(listener: () => void): () => void;
  /** Hear every scan of the session as it runs. */
  observeScan(observer: ScanObserver): () => void;
  /**
   * Hide the sidebar and the main panel and hand the body to `start`'s
   * takeover until the returned release runs (idempotent). Keys reach it
   * after the dialogs.
   */
  takeOver(start: (surface: TakeoverSurface) => Takeover): () => void;
}

export interface ViewDefinition {
  readonly id: ViewId;
  /** Sidebar label (French, from the feature's labels module). */
  readonly label: string;
  /** Position in the sidebar within its group, lower first. */
  readonly order: number;
  /** 0: work views, 1: information and settings; a blank row separates them, "Quitter" follows. */
  readonly group: 0 | 1;
  create(context: ViewContext): Panel;
  badge?(context: ViewContext): SidebarBadge | null;
  /** Facts this view adds to the title bar. */
  facts?(context: ViewContext): readonly string[];
}
