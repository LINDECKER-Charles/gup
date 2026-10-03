import { vi } from "vitest";
import type { MenuState } from "../../../../src/commands/menu-state.js";
import { ConfigStore } from "../../../../src/core/config/store.js";
import type {
  AppearanceControl,
  OptionsHost,
} from "../../../../src/ui/panels/options/option-row.js";
import { SettingsService } from "../../../../src/ui/settings/settings-service.js";
import type { ThemeSettings } from "../../../../src/ui/settings/theme-section.js";
import type { Density } from "../../../../src/ui/theme/appearance.js";
import {
  resolveTheme,
  themeAvailability,
  type TerminalFacts,
} from "../../../../src/ui/theme/resolve-theme.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";
import type { Line } from "../../../../src/ui/tui/styled-lines.js";

/**
 * The Options view's components as plain objects: a host over an in-memory
 * settings service, dialogs answered by the test, and an appearance control
 * resolving themes for real against given terminal facts (with spies on the
 * preview), as the theme engine would.
 */

export const key = (name: string): KeyPress => ({ name, sequence: name, ctrl: false });

export const VIEW = { width: 100, height: 40 };

/** The lines as text, one per row. */
export function text(lines: readonly Line[]): string {
  return lines.map((line) => line.map((segment) => segment.text).join("")).join("\n");
}

/** The row of `lines` whose text contains `needle`, as segments. */
export function lineWith(lines: readonly Line[], needle: string): Line {
  const line = lines.find((candidate) => text([candidate]).includes(needle));
  if (!line) throw new Error(`no line contains "${needle}"`);
  return line;
}

export const TRUECOLOR_UNKNOWN: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

export interface FixtureOptions {
  readonly store?: ConfigStore;
  readonly terminal?: TerminalFacts;
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
  readonly appearance: AppearanceControl & {
    readonly preview: ReturnType<typeof vi.fn>;
    readonly endPreview: ReturnType<typeof vi.fn>;
  };
  /** The theme previewed now, null when none. */
  previewed(): ThemeSettings | null;
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
  let previewed: ThemeSettings | null = null;
  const env = options.env ?? {};
  const input = (theme: ThemeSettings) => ({
    settings: theme,
    terminal: options.terminal ?? TRUECOLOR_UNKNOWN,
    isNoColor: env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "",
  });
  const appearance = {
    resolved: () => resolveTheme(input(previewed ?? settings.get("theme"))),
    preview: vi.fn((theme: ThemeSettings) => void (previewed = theme)),
    endPreview: vi.fn(() => void (previewed = null)),
    availability: () => themeAvailability(input(settings.get("theme"))),
  };
  const host: OptionsHost = {
    settings,
    appearance,
    state,
    dialogs,
    env,
    density: () => options.density ?? "comfortable",
    rescan: vi.fn(),
    copyToClipboard: vi.fn(() => true),
    setMouse: vi.fn(),
    redraw: vi.fn(),
  };
  return { host, settings, state, dialogs, appearance, previewed: () => previewed };
}

/** Let a dialog's answer reach the code that awaited it. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
