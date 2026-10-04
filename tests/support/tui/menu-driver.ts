import type { TestRendererSetup } from "@opentui/core/testing";
import { onTestFinished, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderStatusReport } from "../../../src/core/platform/types.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { UpdateReport } from "../../../src/core/update/update-report.js";
import {
  MenuSession,
  type MenuController,
  type SessionExit,
} from "../../../src/ui/app/session/menu-session.js";
import {
  DEFAULT_UI_PREFERENCES,
  setUiPreferencesSource,
  type UiPreferences,
} from "../../../src/ui/app/ui-preferences.js";
import { setLauncherFactory, type LauncherFactory } from "../../../src/ui/app/update-launcher.js";
import type {
  ViewContext,
  ViewDefinition,
  ViewId,
} from "../../../src/ui/app/view-definition.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { seg } from "../../../src/ui/tui/styled-lines.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import { createTestHost, frame, press } from "./test-host.js";

/**
 * The interactive menu on OpenTUI's in-memory renderer, with a scripted
 * controller: what every menu, view and screenshot test boots instead of
 * wiring a session by hand.
 */
export interface MenuDriverOptions {
  /** What the scan finds; default: nothing outdated. */
  readonly scans?: readonly ProviderScanResult[];
  /** Terminal size; default 100 × 30. */
  readonly size?: { readonly cols: number; readonly rows: number };
  /** Overrides of the scripted controller's methods. */
  readonly controller?: Partial<MenuController>;
  /** The views; default: the foundation's four, Providers fed by `providers`. */
  readonly views?: readonly ViewDefinition[];
  /** What the default Providers view reports; default: empty groups. */
  readonly providers?: ProviderStatusReport;
  readonly scanOnStart?: boolean;
  readonly initialView?: ViewId;
  readonly state?: Partial<MenuState>;
  readonly createAppearance?: AppearanceFactory;
  /** Installed as the launcher slot for this test only. */
  readonly launcher?: LauncherFactory;
  /** The menu preferences for this test only; change them live with `setPreferences`. */
  readonly preferences?: Partial<UiPreferences>;
}

export interface MenuDriver {
  readonly screen: TestRendererSetup;
  readonly controller: MenuController;
  readonly state: MenuState;
  /** How the session ended. */
  readonly exit: Promise<SessionExit>;
  press(...keys: string[]): Promise<void>;
  frame(): Promise<string>;
  /** The frame once it contains `text`. */
  waitForText(text: string): Promise<string>;
  /** Change the preferences as the settings would, notifying the menu. */
  setPreferences(patch: Partial<UiPreferences>): void;
}

/** The report of an update that did nothing. */
export const EMPTY_REPORT: UpdateReport = {
  entries: [],
  cancelled: [],
  succeeded: [],
  skipped: [],
  failed: [],
};

const NO_PROVIDERS: ProviderStatusReport = {
  platform: "win32",
  detected: [],
  missing: [],
  incompatible: [],
};

/** The foundation's views, the Providers one reading `report`. */
export function defaultViews(report: ProviderStatusReport = NO_PROVIDERS): ViewDefinition[] {
  return [optionsView(), packagesView(), providersView({ status: async () => report }), scanView()];
}

/**
 * A Planification stand-in that shows "planifications" and hands the test
 * the ViewContext it was built with: what a test needs to drive the menu's
 * launcher as a view does.
 */
export function contextView(): { readonly view: ViewDefinition; context(): ViewContext } {
  let captured: ViewContext | null = null;
  const view: ViewDefinition = {
    id: "schedules",
    label: "Planification",
    order: 30,
    group: 0,
    create: (context) => {
      captured = context;
      return {
        title: "Planification",
        isCapturingText: false,
        hints: () => "",
        render: () => [[seg("planifications")]],
        press: () => {},
        click: () => {},
        scroll: () => {},
      };
    },
  };
  return {
    view,
    context: () => {
      if (!captured) throw new Error("the menu has not built the view yet");
      return captured;
    },
  };
}

/** A controller whose scan reports one finished provider per scan result and stores them. */
export function scriptedController(scans: readonly ProviderScanResult[]): MenuController {
  return {
    scan: vi.fn(async (state: MenuState, events) => {
      events.detecting();
      events.planned(scans.length);
      for (const scan of scans) {
        events.started(scan.providerId);
        events.finished(scan.providerId, { updates: scan.packages.length, ms: 1000 });
      }
      events.completed(1000);
      state.scans = [...scans];
      state.detectedCount = scans.length;
    }),
    updateOutside: vi.fn(async () => EMPTY_REPORT),
    displayName: vi.fn((providerId: string) => providerId),
  };
}

/**
 * Install the test's slots (launcher, preferences) until the test ends, and
 * hand back the live preference setter.
 */
function installSlots(options: MenuDriverOptions): (patch: Partial<UiPreferences>) => void {
  if (options.launcher) setLauncherFactory(options.launcher);
  let current: UiPreferences = { ...DEFAULT_UI_PREFERENCES, ...options.preferences };
  const listeners = new Set<() => void>();
  setUiPreferencesSource({
    current: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  });
  onTestFinished(() => {
    setLauncherFactory(null);
    setUiPreferencesSource(null);
  });
  return (patch) => {
    current = { ...current, ...patch };
    for (const listener of listeners) listener();
  };
}

export async function bootMenu(options: MenuDriverOptions = {}): Promise<MenuDriver> {
  const setPreferences = installSlots(options);
  const state: MenuState = {
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 0,
    providers: [],
    ...options.state,
  };
  const controller = { ...scriptedController(options.scans ?? []), ...options.controller };
  const { host, next } = createTestHost({
    ...(options.size && { size: options.size }),
    ...(options.createAppearance && { createAppearance: options.createAppearance }),
  });
  let endSession: (exit: SessionExit) => void = () => {};
  const isTestOver = new Promise<SessionExit>((resolve) => (endSession = resolve));
  const exit = host.run((screen) => {
    const session = new MenuSession(screen, {
      state,
      controller,
      views: options.views ?? defaultViews(options.providers),
      scanOnStart: options.scanOnStart ?? true,
      ...(options.initialView && { initialView: options.initialView }),
    });
    return Promise.race([session.run(), isTestOver]);
  });
  // A test that leaves the menu open must not leave its renderer behind (its
  // process listeners pile up across the file): once the test is over, end
  // the session, and the host releases the screen as it does on a quit.
  onTestFinished(async () => {
    endSession({ kind: "quit" });
    await exit.catch(() => undefined);
  });
  const screen = await next();
  return {
    screen,
    controller,
    state,
    exit,
    press: (...keys) => press(screen, ...keys),
    frame: () => frame(screen),
    waitForText: async (text) => {
      await screen.waitForFrame((current) => current.includes(text));
      return frame(screen);
    },
    setPreferences,
  };
}
