import type { KeyEvent } from "@opentui/core";
import { countPackages, withoutUpdated, type MenuState } from "../../commands/menu-state.js";
import type { SelectedPackage } from "../../core/types.js";
import type { UpdateReport } from "../../core/update/update-report.js";
import type { Viewport } from "../panels/panel.js";
import type { ScanEvents } from "../panels/scan-panel.js";
import { ScanBus } from "../scan-progress.js";
import {
  PANEL_HINTS_TAIL,
  providerCountFact,
  SIDEBAR_HINTS,
  SIDEBAR_TITLE,
} from "../text/menu-labels.js";
import { Chrome, CHROME_ROWS } from "../tui/chrome.js";
import { DialogLayer } from "../tui/dialog.js";
import type { KeyPress, Screen } from "../tui/screen-host.js";
import { panelFrame, TextPanel } from "../tui/text-panel.js";
import { entryAtRow, QUIT, renderSidebar, SIDEBAR_WIDTH } from "./sidebar.js";
import { uiPreferences, type UiPreferences } from "./ui-preferences.js";
import { launcherFactory, type LaunchRequest, type LauncherContext } from "./update-launcher.js";
import type {
  Takeover,
  TakeoverSurface,
  ViewContext,
  ViewDefinition,
  ViewId,
} from "./view-definition.js";
import { ViewRegistry } from "./view-registry.js";

/** What the menu needs from the rest of gup. Implemented by the menu command. */
export interface MenuController {
  scan(state: MenuState, events: ScanEvents): Promise<void>;
  displayName(providerId: string): string;
  /**
   * Update on the plain terminal, once the screen is gone: the pipeline and
   * console output of `gup update`. Resolves with what happened.
   */
  updateOutside(
    packages: readonly SelectedPackage[],
    request?: LaunchRequest,
  ): Promise<UpdateReport>;
}

/**
 * How a session ends: the user quits, or an update needs the terminal back —
 * the app runs it after the screen is gone, then mounts a new session on
 * `returnTo` (default Paquets).
 */
export type SessionExit =
  | { readonly kind: "quit" }
  | {
      readonly kind: "outside";
      readonly run: () => Promise<UpdateReport>;
      readonly returnTo?: ViewId;
    };

export interface SessionDeps {
  readonly state: MenuState;
  readonly controller: MenuController;
  /** The menu's views; the sidebar lists them by group and order. */
  readonly views: readonly ViewDefinition[];
  readonly scanOnStart: boolean;
  /** The view in front at start, when registered (default: Scan); else the first one. */
  readonly initialView?: ViewId;
}

const FRAME_MS = 100;

/**
 * One mounted run of the menu: sidebar, the registered views, dialogs, live
 * scans. It knows no view in particular beyond the Scan → Paquets landing:
 * each view is built from its definition and reaches the menu through a
 * ViewContext. The session ends when the user quits, or when an update must
 * run with the terminal to itself — the app then tears the screen down, runs
 * it, and mounts a new session.
 *
 * Keys go, in order, to: an open dialog, a takeover, the focused panel when
 * it captures text or claims the key, the global bindings (q, Tab, ←), then
 * the focused panel or the sidebar.
 */
export class MenuSession {
  readonly #deps: SessionDeps;
  readonly #screen: Screen;
  readonly #chrome: Chrome;
  readonly #sidebar: TextPanel;
  readonly #main: TextPanel;
  readonly #dialogs: DialogLayer;
  readonly #views: ViewRegistry;
  readonly #scans: ScanBus;
  #focus: "sidebar" | "main" = "main";
  #navCursor = 0;
  #takeover: Takeover | null = null;
  #exit: (exit: SessionExit) => void = () => {};

  constructor(screen: Screen, deps: SessionDeps) {
    this.#screen = screen;
    this.#deps = deps;
    this.#chrome = new Chrome(screen);
    this.#sidebar = new TextPanel(screen, this.#chrome.body, {
      id: "gup-nav",
      title: SIDEBAR_TITLE,
      width: SIDEBAR_WIDTH,
    });
    this.#main = new TextPanel(screen, this.#chrome.body, { id: "gup-main", title: "" });
    this.#dialogs = new DialogLayer(screen);
    this.#views = new ViewRegistry(deps.views, deps.initialView ?? "scan");
    this.#scans = new ScanBus((events) => deps.controller.scan(deps.state, events));
    this.#views.mount(this.createContext());
  }

  run(): Promise<SessionExit> {
    return new Promise<SessionExit>((resolve) => {
      const timer = setInterval(() => this.tick(), FRAME_MS);
      const redraw = (): void => this.draw();
      const unsubscribe = [
        this.#screen.appearance.onChange(redraw),
        uiPreferences().subscribe(redraw),
      ];
      this.#exit = (exit) => {
        clearInterval(timer);
        for (const stop of unsubscribe) stop();
        resolve(exit);
      };
      this.wireInput();
      this.#views.panel?.onShow?.();
      if (this.#deps.scanOnStart) void this.scan();
      else this.#scans.announceResults();
      this.draw();
    });
  }

  private createContext(): ViewContext {
    const { state, controller } = this.#deps;
    return {
      screen: this.#screen,
      state,
      dialogs: this.#dialogs,
      updates: launcherFactory()(this.launcherContext()),
      preferences,
      displayName: (providerId) => controller.displayName(providerId),
      redraw: () => this.draw(),
      show: (view) => {
        this.#views.show(view);
        this.draw();
      },
      rescan: () => this.rescan(),
      onScansChanged: (listener) => this.#scans.onResults(listener),
      observeScan: (observer) => this.#scans.observe(observer),
      takeOver: (start) => this.takeOver(start),
    };
  }

  private launcherContext(): LauncherContext {
    return {
      screen: this.#screen,
      dialogs: this.#dialogs,
      state: this.#deps.state,
      controller: this.#deps.controller,
      preferences,
      takeOver: (start) => this.takeOver(start),
      exit: (exit) => this.#exit(exit),
      afterUpdate: (report, returnTo) => this.afterUpdate(report, returnTo),
    };
  }

  private wireInput(): void {
    const { renderer } = this.#screen;
    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      this.onKey(key);
      this.draw();
    });
    renderer.on("resize", () => this.draw());
    // The mouse reaches what is under the pointer, dialog or not: ignore it
    // while a dialog is open, or a click beside it would tick a package hidden
    // behind it.
    this.#sidebar.onRowClick((row) => this.whenBrowsing(() => this.clickNav(row)));
    this.#main.onRowClick((row) =>
      this.whenBrowsing(() => {
        this.#focus = "main";
        this.#views.panel?.click(row, this.viewport());
      }),
    );
    this.#main.onScroll((step) => this.whenBrowsing(() => this.#views.panel?.scroll(step)));
  }

  /** Run a mouse action unless a dialog or a takeover owns the screen. */
  private whenBrowsing(action: () => void): void {
    if (this.#dialogs.isOpen || this.#takeover) return;
    action();
    this.draw();
  }

  private clickNav(row: number): void {
    const index = entryAtRow(this.#views.layout(this.#screen.appearance.density), row);
    if (index !== null) this.activate(index);
  }

  private onKey(key: KeyEvent): void {
    const overlay = this.overlayFor(key);
    if (overlay) return overlay(key);
    if (this.isClaimedByPanel(key)) return this.#views.panel?.press(key);
    const global = this.globalKeys()[key.name];
    if (global) return global();
    if (this.#focus === "main") return this.#views.panel?.press(key);
    if (key.name === "right") this.#focus = "main";
    else this.navKey(key);
  }

  /** Who hears `key` before the menu: the screen (Ctrl+C), an open dialog, a takeover. */
  private overlayFor(key: KeyPress): ((key: KeyEvent) => void) | null {
    if (key.ctrl && key.name === "c") return () => {};
    if (this.#dialogs.isOpen) return (pressed) => this.#dialogs.press(pressed);
    const takeover = this.#takeover;
    return takeover ? (pressed) => takeover.press(pressed) : null;
  }

  /** The focused panel takes the key before the global bindings: text input, or a claim. */
  private isClaimedByPanel(key: KeyPress): boolean {
    const panel = this.#views.panel;
    if (this.#focus !== "main" || !panel) return false;
    if (panel.isCapturingText) return true;
    const isReserved = key.name === "q" || key.name === "tab";
    return !isReserved && panel.wantsKey?.(key) === true;
  }

  private globalKeys(): Record<string, () => void> {
    return {
      q: () => this.#exit({ kind: "quit" }),
      tab: () => (this.#focus === "main" ? this.focusSidebar() : (this.#focus = "main")),
      left: () => this.focusSidebar(),
    };
  }

  /** Give the sidebar the focus, its cursor on the view on screen. */
  private focusSidebar(): void {
    this.#focus = "sidebar";
    this.#navCursor = this.#views.indexOf(this.#views.current);
  }

  private navKey(key: KeyPress): void {
    if (key.name === "up" || key.name === "k") this.moveNav(-1);
    else if (key.name === "down" || key.name === "j") this.moveNav(1);
    else if (["return", "enter", "space"].includes(key.name)) this.activate(this.#navCursor);
  }

  private moveNav(step: number): void {
    const last = this.#views.entries.length - 1;
    this.#navCursor = Math.max(0, Math.min(last, this.#navCursor + step));
    const entry = this.#views.entries[this.#navCursor];
    if (entry && entry.id !== QUIT) this.#views.show(entry.id);
  }

  private activate(index: number): void {
    const entry = this.#views.entries[index];
    if (!entry) return;
    this.#navCursor = index;
    if (entry.id === QUIT) return this.#exit({ kind: "quit" });
    this.#views.show(entry.id);
    this.#focus = "main";
  }

  /** A scan the user asked for: the Scan view comes to the front. */
  private rescan(): void {
    if (this.#scans.isRunning) return;
    this.#views.show("scan");
    void this.scan();
    this.draw();
  }

  /** Scan, then land on Paquets when the Scan view is in front and there is something to update. */
  private async scan(): Promise<void> {
    await this.#scans.run();
    if (this.#views.current === "scan" && countPackages(this.#deps.state.scans) > 0) {
      this.#views.show("packages");
    }
    this.draw();
  }

  private takeOver(start: (surface: TakeoverSurface) => Takeover): () => void {
    this.setBrowsing(false);
    const takeover = start({
      screen: this.#screen,
      body: this.#chrome.body,
      dialogs: this.#dialogs,
      setFacts: (facts) => this.#chrome.setFacts(facts),
      setHints: (hints) => this.#chrome.setHints(hints),
    });
    this.#takeover = takeover;
    this.draw();
    return () => {
      if (this.#takeover !== takeover) return;
      this.#takeover = null;
      this.setBrowsing(true);
      this.draw();
    };
  }

  private setBrowsing(isVisible: boolean): void {
    this.#sidebar.box.visible = isVisible;
    this.#main.box.visible = isVisible;
  }

  /**
   * An update ran inside the screen. Rescan when the preferences ask for it
   * (the Scan view comes to the front unless the update was launched from
   * another view); otherwise drop what was updated, and go back.
   */
  private afterUpdate(report: UpdateReport, returnTo?: ViewId): void {
    if (!preferences().rescanAfterUpdate) {
      const { state } = this.#deps;
      state.scans = withoutUpdated(state.scans, report);
      this.#scans.announceResults();
      this.#views.show(returnTo ?? "packages");
    } else if (returnTo) {
      this.#views.show(returnTo);
      void this.scan();
    } else {
      this.rescan();
    }
    this.draw();
  }

  private tick(): void {
    if (this.#takeover) {
      this.#takeover.tick();
      return this.draw();
    }
    if (!this.#scans.isRunning) return;
    // Animations off: the spinner stands still, the progress still redraws.
    if (preferences().animations) this.#scans.tick();
    this.draw();
  }

  private viewport(): Viewport {
    const { terminalWidth, terminalHeight } = this.#screen.renderer;
    const frame = panelFrame(this.#screen.appearance.density);
    return {
      width: Math.max(10, terminalWidth - SIDEBAR_WIDTH - frame.cols),
      height: Math.max(3, terminalHeight - CHROME_ROWS - frame.rows),
    };
  }

  private draw(): void {
    if (this.#takeover) return this.#takeover.draw();
    const panel = this.#views.panel;
    this.#main.setTitle(panel?.title ?? "");
    this.#main.show(panel?.render(this.viewport()) ?? []);
    this.#main.setFocused(this.#focus === "main");
    this.#sidebar.setFocused(this.#focus === "sidebar");
    this.drawSidebar();
    const { detectedCount } = this.#deps.state;
    this.#chrome.setFacts([providerCountFact(detectedCount), ...this.#views.facts()]);
    this.#chrome.setHints(this.hints());
  }

  private drawSidebar(): void {
    const { density } = this.#screen.appearance;
    const isFocused = this.#focus === "sidebar";
    const state = { current: this.#views.current, cursor: this.#navCursor, isFocused };
    const width = SIDEBAR_WIDTH - panelFrame(density).cols;
    this.#sidebar.show(renderSidebar(this.#views.layout(density), state, width));
  }

  private hints(): string {
    const panel = this.#views.panel;
    if (this.#dialogs.isOpen) return "";
    if (this.#focus === "sidebar" || !panel) return SIDEBAR_HINTS;
    return `${panel.hints()} · ${PANEL_HINTS_TAIL}`;
  }
}

function preferences(): UiPreferences {
  return uiPreferences().current();
}
