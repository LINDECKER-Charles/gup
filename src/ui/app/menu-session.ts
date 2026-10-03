import type { KeyEvent } from "@opentui/core";
import type { MenuState } from "../../commands/menu-state.js";
import { setInstallTimeoutSeconds, getInstallTimeoutSeconds } from "../../core/runner.js";
import type { SelectedPackage } from "../../core/types.js";
import { OptionsPanel } from "../panels/options-panel.js";
import { PackageList } from "../panels/package-list.js";
import { PackagesPanel } from "../panels/packages-panel.js";
import type { Panel, Viewport } from "../panels/panel.js";
import { ProvidersPanel, type ProviderInfo } from "../panels/providers-panel.js";
import { ScanPanel, type ScanEvents } from "../panels/scan-panel.js";
import { Chrome, CHROME_ROWS } from "../tui/chrome.js";
import { DialogLayer } from "../tui/dialog.js";
import type { KeyPress, Screen } from "../tui/screen-host.js";
import { PANEL_FRAME, TextPanel } from "../tui/text-panel.js";
import {
  entryAtRow,
  NAV,
  renderSidebar,
  SIDEBAR_WIDTH,
  type NavEntry,
  type ViewId,
} from "./sidebar.js";

/** What the menu needs from the rest of gup. Implemented by the menu command. */
export interface MenuController {
  scan(state: MenuState, events: ScanEvents): Promise<void>;
  providersStatus(): Promise<{ detected: ProviderInfo[]; missing: ProviderInfo[] }>;
  updatePackages(packages: SelectedPackage[]): Promise<void>;
  updateTargets(targets: string[]): Promise<void>;
  validateTargets(raw: string): true | string;
  displayName(providerId: string): string;
}

/** How a session ends: the user quits, or a job needs the terminal back. */
export type SessionExit = { kind: "quit" } | { kind: "outside"; run: () => Promise<void> };

export interface SessionDeps {
  readonly state: MenuState;
  readonly controller: MenuController;
  readonly scanOnStart: boolean;
}

const FRAME_MS = 100;

/**
 * One mounted run of the menu: sidebar, main panel, dialogs, live scan. It
 * ends when the user quits, or when an update must run with the terminal to
 * itself — the app then tears the screen down, runs it, and mounts a new
 * session.
 */
export class MenuSession {
  readonly #deps: SessionDeps;
  readonly #screen: Screen;
  readonly #chrome: Chrome;
  readonly #sidebar: TextPanel;
  readonly #main: TextPanel;
  readonly #dialogs: DialogLayer;
  readonly #panels: Record<ViewId, Panel>;
  readonly #scan: ScanPanel;
  readonly #packages: PackagesPanel;
  readonly #providers = new ProvidersPanel();
  #current: ViewId = "scan";
  #focus: "sidebar" | "main" = "main";
  #navCursor = 0;
  #exit: (exit: SessionExit) => void = () => {};

  constructor(screen: Screen, deps: SessionDeps) {
    this.#screen = screen;
    this.#deps = deps;
    this.#chrome = new Chrome(screen);
    this.#sidebar = new TextPanel(screen, this.#chrome.body, {
      id: "gup-nav",
      title: "Menu",
      width: SIDEBAR_WIDTH,
    });
    this.#main = new TextPanel(screen, this.#chrome.body, { id: "gup-main", title: "Scan" });
    this.#dialogs = new DialogLayer(screen);
    this.#scan = new ScanPanel(() => void this.rescan());
    this.#packages = new PackagesPanel((packages) => void this.confirmUpdate(packages));
    const options = new OptionsPanel(deps.state, {
      onEditTimeout: () => void this.editTimeout(),
      onRescan: () => void this.rescan(),
    });
    this.#panels = {
      scan: this.#scan,
      packages: this.#packages,
      providers: this.#providers,
      options,
    };
  }

  run(): Promise<SessionExit> {
    return new Promise<SessionExit>((resolve) => {
      const timer = setInterval(() => this.tick(), FRAME_MS);
      this.#exit = (exit) => {
        clearInterval(timer);
        resolve(exit);
      };
      this.wireInput();
      if (this.#deps.scanOnStart) void this.rescan();
      else this.refreshPackages();
      this.draw();
    });
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
    this.#sidebar.onRowClick((row) => this.unlessDialog(() => this.clickNav(row)));
    this.#main.onRowClick((row) =>
      this.unlessDialog(() => {
        this.#focus = "main";
        this.panel().click(row, this.viewport());
      }),
    );
    this.#main.onScroll((step) => this.unlessDialog(() => this.panel().scroll(step)));
  }

  private unlessDialog(action: () => void): void {
    if (this.#dialogs.isOpen) return;
    action();
    this.draw();
  }

  private clickNav(row: number): void {
    const index = entryAtRow(row);
    if (index !== null) this.activate(index);
  }

  private onKey(key: KeyPress): void {
    if (this.#dialogs.isOpen) return this.#dialogs.press(key);
    if (this.#focus === "main" && this.panel().isCapturingText) return this.panel().press(key);
    const global: Record<string, () => void> = {
      q: () => this.#exit({ kind: "quit" }),
      tab: () => (this.#focus === "main" ? this.focusSidebar() : (this.#focus = "main")),
      left: () => this.focusSidebar(),
    };
    const handled = global[key.name];
    if (handled) return handled();
    if (this.#focus === "main") return this.panel().press(key);
    if (key.name === "right") this.#focus = "main";
    else this.navKey(key);
  }

  /** Give the sidebar the focus, its cursor on the view on screen. */
  private focusSidebar(): void {
    this.#focus = "sidebar";
    this.#navCursor = NAV.findIndex((entry) => entry.id === this.#current);
  }

  private navKey(key: KeyPress): void {
    if (key.name === "up" || key.name === "k") this.moveNav(-1);
    else if (key.name === "down" || key.name === "j") this.moveNav(1);
    else if (["return", "enter", "space"].includes(key.name)) this.activate(this.#navCursor);
  }

  private moveNav(step: number): void {
    this.#navCursor = Math.max(0, Math.min(NAV.length - 1, this.#navCursor + step));
    const entry = NAV[this.#navCursor];
    if (entry && !entry.isAction) this.show(entry.id as ViewId);
  }

  private activate(index: number): void {
    const entry: NavEntry | undefined = NAV[index];
    if (!entry) return;
    this.#navCursor = index;
    if (!entry.isAction) {
      this.show(entry.id as ViewId);
      this.#focus = "main";
    } else if (entry.id === "update-all") {
      void this.confirmUpdate(this.allPackages());
    } else if (entry.id === "target") {
      void this.askTarget();
    } else {
      this.#exit({ kind: "quit" });
    }
  }

  private show(view: ViewId): void {
    this.#current = view;
    if (view === "providers" && !this.#providers.hasData) void this.loadProviders();
  }

  private panel(): Panel {
    return this.#panels[this.#current];
  }

  private async rescan(): Promise<void> {
    if (this.#scan.isRunning) return;
    this.show("scan");
    try {
      await this.#deps.controller.scan(this.#deps.state, this.#scan);
    } catch (err) {
      this.#scan.failed(err instanceof Error ? err.message : String(err));
    }
    this.refreshPackages();
    if (this.#current === "scan" && this.allPackages().length > 0) this.show("packages");
    this.draw();
  }

  private refreshPackages(): void {
    const { controller, state } = this.#deps;
    this.#packages.setList(new PackageList(state.scans, (id) => controller.displayName(id)));
  }

  private async loadProviders(): Promise<void> {
    try {
      const { detected, missing } = await this.#deps.controller.providersStatus();
      this.#providers.setData(detected, missing);
    } catch {
      this.#providers.setData([], []);
    }
    this.draw();
  }

  private async confirmUpdate(packages: SelectedPackage[]): Promise<void> {
    if (packages.length === 0) return;
    const shown = packages
      .slice(0, 8)
      .map((p) => `• ${p.pkg.name ?? p.pkg.id}  ${p.pkg.current} → ${p.pkg.latest}`);
    const more =
      packages.length > shown.length ? [`… et ${packages.length - shown.length} autre(s)`] : [];
    const isConfirmed = await this.#dialogs.confirm({
      title: "Mettre à jour",
      text: [`${packages.length} paquet(s) vont être mis à jour :`, "", ...shown, ...more],
    });
    this.draw();
    if (isConfirmed) {
      this.#exit({ kind: "outside", run: () => this.#deps.controller.updatePackages(packages) });
    }
  }

  private async askTarget(): Promise<void> {
    const { controller } = this.#deps;
    const raw = await this.#dialogs.ask({
      title: "Mettre à jour une cible",
      text: ["provider:package — plusieurs cibles séparées par des espaces ou des virgules."],
      validate: (value) => controller.validateTargets(value),
    });
    this.draw();
    if (!raw) return;
    const targets = raw.split(/[\s,]+/).filter(Boolean);
    this.#exit({ kind: "outside", run: () => controller.updateTargets(targets) });
  }

  private async editTimeout(): Promise<void> {
    const value = await this.#dialogs.ask({
      title: "Timeout par install",
      text: ["En secondes. Une install bloquée au-delà est ignorée ; 0 désactive le timeout."],
      default: String(getInstallTimeoutSeconds()),
      validate: (v) =>
        (v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) || "un nombre de secondes >= 0",
    });
    if (value !== undefined) setInstallTimeoutSeconds(Number(value));
    this.draw();
  }

  private allPackages(): SelectedPackage[] {
    return this.#deps.state.scans.flatMap((scan) =>
      scan.packages.map((pkg) => ({ providerId: scan.providerId, pkg })),
    );
  }

  private tick(): void {
    if (!this.#scan.isRunning) return;
    this.#scan.tick();
    this.draw();
  }

  private viewport(): Viewport {
    const { terminalWidth, terminalHeight } = this.#screen.renderer;
    return {
      width: Math.max(10, terminalWidth - SIDEBAR_WIDTH - PANEL_FRAME.cols),
      height: Math.max(3, terminalHeight - CHROME_ROWS - PANEL_FRAME.rows),
    };
  }

  private draw(): void {
    const panel = this.panel();
    this.#main.setTitle(panel.title);
    this.#main.show(panel.render(this.viewport()));
    this.#main.setFocused(this.#focus === "main");
    this.#sidebar.setFocused(this.#focus === "sidebar");
    this.#sidebar.show(renderSidebar(this.sidebarState(), SIDEBAR_WIDTH - PANEL_FRAME.cols));
    this.#chrome.setFacts(this.facts());
    this.#chrome.setHints(this.hints(panel));
  }

  private sidebarState() {
    const total = this.allPackages().length;
    return {
      current: this.#current,
      cursor: this.#navCursor,
      isFocused: this.#focus === "sidebar",
      badges: total > 0 ? { packages: String(total) } : {},
    };
  }

  private facts(): string[] {
    const { state } = this.#deps;
    const total = this.allPackages().length;
    const filter =
      state.filter.length === 0
        ? "tous les providers"
        : `${state.filter.length} provider(s) filtrés`;
    return [
      `${state.detectedCount} provider(s)`,
      total === 0 ? "à jour" : `${total} mise(s) à jour`,
      `${state.fast ? "mode rapide" : "mode normal"} · ${filter}`,
    ];
  }

  private hints(panel: Panel): string {
    if (this.#dialogs.isOpen) return "";
    if (this.#focus === "sidebar") return "↑↓ naviguer · entrée ouvrir · tab contenu · q quitter";
    return `${panel.hints()} · tab menu · q quitter`;
  }
}
