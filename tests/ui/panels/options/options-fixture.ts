import { vi } from "vitest";
import type { MenuState } from "../../../../src/commands/menu-state.js";
import { ConfigStore } from "../../../../src/core/config/store.js";
import type { OptionsHost } from "../../../../src/ui/panels/options/option-row.js";
import { SettingsService } from "../../../../src/ui/settings/settings-service.js";
import type { Density } from "../../../../src/ui/theme/appearance.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";
import type { Line } from "../../../../src/ui/tui/styled-lines.js";

/**
 * The Options view's components as plain objects: a host over an in-memory
 * settings service, and dialogs answered by the test.
 */

export const key = (name: string): KeyPress => ({ name, sequence: name, ctrl: false });

export const VIEW = { width: 100, height: 40 };

/** The lines as text, one per row. */
export function text(lines: readonly Line[]): string {
  return lines.map((line) => line.map((segment) => segment.text).join("")).join("\n");
}

export interface FixtureOptions {
  readonly store?: ConfigStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly density?: Density;
}

export interface OptionsFixture {
  readonly host: OptionsHost;
  readonly settings: SettingsService;
  readonly state: MenuState;
  readonly dialogs: {
    readonly ask: ReturnType<typeof vi.fn>;
    readonly choose: ReturnType<typeof vi.fn>;
    readonly confirm: ReturnType<typeof vi.fn>;
  };
}

export function optionsFixture(options: FixtureOptions = {}): OptionsFixture {
  const settings = new SettingsService(
    options.store ?? new ConfigStore({ file: null, isDisabled: true }),
  );
  const state: MenuState = {
    scans: [],
    fast: false,
    filter: [],
    detectedCount: 2,
    providers: [
      { id: "winget", displayName: "Winget" },
      { id: "pip", displayName: "pip" },
    ],
  };
  const dialogs = { ask: vi.fn(), choose: vi.fn(), confirm: vi.fn() };
  const host: OptionsHost = {
    settings,
    state,
    dialogs,
    env: options.env ?? {},
    density: () => options.density ?? "comfortable",
    rescan: vi.fn(),
    copyToClipboard: vi.fn(() => true),
    setMouse: vi.fn(),
    redraw: vi.fn(),
  };
  return { host, settings, state, dialogs };
}

/** Let a dialog's answer reach the code that awaited it. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
