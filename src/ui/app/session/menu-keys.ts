import type { KeyEvent } from "@opentui/core";
import { MENU_LABELS } from "../../text/menu-labels.js";
import type { DialogLayer } from "../../tui/dialog.js";
import type { KeyPress } from "../../tui/screen-host.js";
import type { Takeover } from "../view-definition.js";
import type { MenuNav } from "./menu-nav.js";
import type { ViewRegistry } from "./view-registry.js";

/** What the menu's keys can reach. */
export interface KeyTargets {
  readonly dialogs: DialogLayer;
  readonly views: ViewRegistry;
  readonly nav: MenuNav;
  /** The full-body screen in front (the run view), if any. */
  readonly takeover: () => Takeover | null;
  /** `q`: end the session — once confirmed when a view holds unsaved changes. */
  readonly quit: () => void;
}

/**
 * Who hears a key in the menu, and what the hint bar says. Keys go, in
 * order, to: the screen (Ctrl+C), an open dialog, a takeover, the focused
 * panel when it captures text or claims the key, the global bindings (q,
 * Tab, ←), then the focused panel or the sidebar. The hint bar follows the
 * same order.
 */
export class MenuKeys {
  readonly #targets: KeyTargets;

  constructor(targets: KeyTargets) {
    this.#targets = targets;
  }

  press(key: KeyEvent): void {
    const overlay = this.overlayFor(key);
    if (overlay) return overlay(key);
    const { views, nav } = this.#targets;
    if (this.isClaimedByPanel(key)) return views.panel?.press(key);
    const global = this.globalKeys()[key.name];
    if (global) return global();
    if (nav.isSidebarFocused) return nav.press(key);
    views.panel?.press(key);
  }

  /**
   * An open dialog's keys; else the focused side's, then the global keys the
   * bar must never cut — unless the panel takes them too (text being typed).
   */
  hints(): [hints: string, pinned: string] {
    const { dialogs, views, nav } = this.#targets;
    const panel = views.panel;
    if (dialogs.isOpen) return [dialogs.hints(), ""];
    if (nav.isSidebarFocused || !panel) return [MENU_LABELS.sidebarHints, ""];
    return [panel.hints(), panel.isCapturingText ? "" : MENU_LABELS.panelHintsTail];
  }

  /** Who hears `key` before the menu: the screen (Ctrl+C), an open dialog, a takeover. */
  private overlayFor(key: KeyPress): ((key: KeyEvent) => void) | null {
    if (key.ctrl && key.name === "c") return () => {};
    const { dialogs } = this.#targets;
    if (dialogs.isOpen) return (pressed) => dialogs.press(pressed);
    const takeover = this.#targets.takeover();
    return takeover ? (pressed) => takeover.press(pressed) : null;
  }

  /** The focused panel takes the key before the global bindings: text input, or a claim. */
  private isClaimedByPanel(key: KeyPress): boolean {
    const { views, nav } = this.#targets;
    const panel = views.panel;
    if (nav.isSidebarFocused || !panel) return false;
    if (panel.isCapturingText) return true;
    const isReserved = key.name === "q" || key.name === "tab";
    return !isReserved && panel.wantsKey?.(key) === true;
  }

  private globalKeys(): Record<string, () => void> {
    const { nav, quit } = this.#targets;
    return {
      q: quit,
      tab: () => nav.toggle(),
      left: () => nav.focusSidebar(),
    };
  }
}
