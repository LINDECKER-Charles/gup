import type { TestRendererSetup } from "@opentui/core/testing";
import { vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderStatusReport } from "../../../src/core/platform/types.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import {
  MenuSession,
  type MenuController,
  type SessionExit,
} from "../../../src/ui/app/menu-session.js";
import type { ViewDefinition, ViewId } from "../../../src/ui/app/view-definition.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
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
}

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
    updatePackages: vi.fn(async () => {}),
    displayName: vi.fn((providerId: string) => providerId),
  };
}

export async function bootMenu(options: MenuDriverOptions = {}): Promise<MenuDriver> {
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
  const exit = host.run((screen) =>
    new MenuSession(screen, {
      state,
      controller,
      views: options.views ?? defaultViews(options.providers),
      scanOnStart: options.scanOnStart ?? true,
      ...(options.initialView && { initialView: options.initialView }),
    }).run(),
  );
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
  };
}
