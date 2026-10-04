import type { KeyEvent } from "@opentui/core";
import { countPackages, withoutUpdated, type MenuState } from "../../../commands/menu-state.js";
import type { SelectedPackage } from "../../../core/types.js";
import type { UpdateReport } from "../../../core/update/update-report.js";
import type { Viewport } from "../../panels/panel.js";
import type { ScanEvents } from "../../panels/scan-panel.js";
import { ScanBus } from "../../scan-progress.js";
import { MENU_LABELS, providerFacts, QUIT_DIALOG } from "../../text/menu-labels.js";
import { Chrome, CHROME_ROWS } from "../../tui/chrome.js";
import { DialogLayer } from "../../tui/dialog.js";
import { repaintNextTurn } from "../../tui/repaint-next-turn.js";
import type { Screen } from "../../tui/screen-host.js";
import { panelFrame, TextPanel } from "../../tui/text-panel.js";
import { SIDEBAR_WIDTH } from "../sidebar.js";
import { uiPreferences, type UiPreferences } from "../ui-preferences.js";
import { launcherFactory, type LaunchRequest, type LauncherContext } from "../update-launcher.js";
import type {
  Takeover,
  TakeoverSurface,
  ViewContext,
  ViewDefinition,
  ViewId,
} from "../view-definition.js";
import { MenuKeys } from "./menu-keys.js";
import { MenuNav } from "./menu-nav.js";
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
 * it, and mounts a new session. Who hears a key, and what the hint bar
 * says, is {@link MenuKeys}'s.
 */
export class MenuSession {
  readonly #deps: SessionDeps;
  readonly #screen: Screen;
  readonly #chrome: Chrome;
  readonly #sidebar: TextPanel;
  readonly #main: TextPanel;
  readonly #dialogs: DialogLayer;
  readonly #views: ViewRegistry;
  readonly #nav: MenuNav;
  readonly #keys: MenuKeys;
  readonly #scans: ScanBus;
  #takeover: Takeover | null = null;
  #exit: (exit: SessionExit) => void = () => {};

  constructor(screen: Screen, deps: SessionDeps) {
    this.#screen = screen;
    this.#deps = deps;
    this.#chrome = new Chrome(screen);
    this.#sidebar = new TextPanel(screen, this.#chrome.body, {
      id: "gup-nav",
      title: MENU_LABELS.sidebarTitle,
      width: SIDEBAR_WIDTH,
    });
    this.#main = new TextPanel(screen, this.#chrome.body, { id: "gup-main", title: "" });
    this.#dialogs = new DialogLayer(screen);
    // A dialog a launcher opens once its detection answered comes outside a
    // key: the hint bar must still trade the screen's keys for the dialog's.
    this.#dialogs.onChange(() => {
      if (!screen.renderer.isDestroyed) this.draw();
    });
    this.#views = new ViewRegistry(deps.views, deps.initialView ?? "scan");
    this.#nav = new MenuNav(this.#views, () => void this.quit());
    this.#keys = new MenuKeys({
      dialogs: this.#dialogs,
      views: this.#views,
      nav: this.#nav,
      takeover: () => this.#takeover,
      quit: () => void this.quit(),
    });
    this.#scans = new ScanBus((events) => deps.controller.scan(deps.state, events));
    this.#views.mount(this.createContext());
  }

  run(): Promise<SessionExit> {
    return new Promise<SessionExit>((resolve) => {
      const stopDrawing = this.startDrawing();
      // A screen torn down under the session (Ctrl+C, a signal) takes the
      // clock with it: a frame drawn on a destroyed renderer throws.
      this.#screen.renderer.once("destroy", stopDrawing);
      this.#exit = (exit) => {
        stopDrawing();
        resolve(exit);
      };
      this.wireInput();
      this.#views.panel?.onShow?.();
      if (this.#deps.scanOnStart) void this.scan();
      else if (this.#deps.state.scans.length > 0) this.#scans.announceResults();
      this.draw();
    });
  }

  /** Start the frame clock and the redraws on change; returns an idempotent stop. */
  private startDrawing(): () => void {
    const timer = setInterval(() => this.tick(), FRAME_MS);
    const redraw = (): void => this.draw();
    const unsubscribe = [
      this.#screen.appearance.onChange(redraw),
      uiPreferences().subscribe(redraw),
    ];
    let isStopped = false;
    return () => {
      if (isStopped) return;
      isStopped = true;
      clearInterval(timer);
      for (const stop of unsubscribe) stop();
    };
  }

  private createContext(): ViewContext {
    const { state, controller } = this.#deps;
    return {
      screen: this.#screen,
      state,
      dialogs: this.#dialogs,
      updates: launcherFactory()(this.launcherContext()),
      preferences,
      packageActions: () => this.#views.packageActions(),
      packageMarkers: () => this.#views.packageMarkers(),
      displayName: (providerId) => controller.displayName(providerId),
      redraw: () => this.redrawForView(),
      show: (view) => {
        this.#views.show(view);
        this.redrawForView();
      },
      rescan: () => this.rescan(),
      isScanning: () => this.#scans.isRunning,
      onScansChanged: (listener) => this.#scans.onResults(listener),
      observeScan: (observer) => this.#scans.observe(observer),
      takeOver: (start) => this.takeOver(start),
    };
  }

  /**
   * A redraw a view asks for, often from a promise continuation (a dialog
   * answered, a file read): drawn now, and painted for sure on the next turn.
   */
  private redrawForView(): void {
    this.draw();
    repaintNextTurn(this.#screen.renderer);
  }

  private launcherContext(): LauncherContext {
    return {
      screen: this.#screen,
      dialogs: this.#dialogs,
      state: this.#deps.state,
      controller: this.#deps.controller,
      preferences,
      isScanning: () => this.#scans.isRunning,
      resultActions: () => this.#views.resultActions(),
      takeOver: (start) => this.takeOver(start),
      exit: (exit) => this.#exit(exit),
      afterUpdate: (report, returnTo) => this.afterUpdate(report, returnTo),
    };
  }

  private wireInput(): void {
    const { renderer } = this.#screen;
    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      this.#keys.press(key);
      this.draw();
    });
    renderer.on("resize", () => this.draw());
    // The mouse reaches what is under the pointer, dialog or not: ignore it
    // while a dialog is open, or a click beside it would tick a package hidden
    // behind it.
    this.#sidebar.onRowClick((row) =>
      this.whenBrowsing(() => this.#nav.click(row, this.#screen.appearance.density)),
    );
    this.#main.onRowClick((row) =>
      this.whenBrowsing(() => {
        this.#nav.focusMain();
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

  /** `q` or "Quit": the session ends — once confirmed when a view holds unsaved changes. */
  private async quit(): Promise<void> {
    const unsaved = this.#views.unsavedViews();
    const isConfirmed =
      unsaved.length === 0 ||
      (await this.#dialogs.confirm({
        title: QUIT_DIALOG.title,
        text: [QUIT_DIALOG.text(unsaved)],
        default: false,
      }));
    if (isConfirmed) this.#exit({ kind: "quit" });
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
    this.#main.setFocused(!this.#nav.isSidebarFocused);
    this.#sidebar.setFocused(this.#nav.isSidebarFocused);
    this.drawSidebar();
    const { detectedCount, filter } = this.#deps.state;
    this.#chrome.setFacts([...providerFacts(detectedCount, filter.length), ...this.#views.facts()]);
    this.#chrome.setHints(...this.#keys.hints());
  }

  private drawSidebar(): void {
    const { density } = this.#screen.appearance;
    const width = SIDEBAR_WIDTH - panelFrame(density).cols;
    this.#sidebar.show(this.#nav.render(density, width));
  }
}

function preferences(): UiPreferences {
  return uiPreferences().current();
}
