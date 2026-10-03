import type { CapturedSpan } from "@opentui/core";
import type { TestRendererSetup } from "@opentui/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { ThemeSettings } from "../../../src/ui/settings/theme-section.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import type { TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import {
  staticProbe,
  type TerminalProbe,
} from "../../../src/ui/theme/runtime/terminal-probe.js";
import {
  ThemedAppearance,
  themedAppearance,
  type AppearanceSettings,
  type AppearanceSource,
} from "../../../src/ui/theme/runtime/themed-appearance.js";
import { detectedColorsFrom } from "../../../src/ui/theme/terminal-palette.js";
import { Chrome } from "../../../src/ui/tui/chrome.js";
import { DialogLayer } from "../../../src/ui/tui/dialog.js";
import type { Screen } from "../../../src/ui/tui/screen-host.js";
import { seg, type Tone } from "../../../src/ui/tui/styled-lines.js";
import { loadTui } from "../../../src/ui/tui/load-tui.js";
import { TextPanel } from "../../../src/ui/tui/text-panel.js";
import { frameContrastViolations } from "../../support/tui/frame-contrast.js";
import { CAMPBELL, ONE_HALF_LIGHT } from "../../support/tui/reference-palettes.js";
import { createTestHost } from "../../support/tui/test-host.js";

const UNKNOWN_PALETTE: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: { id: "terminal", contrast: "AA", custom: {} },
  glyphs: "unicode",
  density: "comfortable",
};

/** Settings the test changes as the settings service would, notifying the appearance. */
function settingsSource(initial: Partial<AppearanceSettings> = {}): AppearanceSource & {
  set(patch: Partial<AppearanceSettings>): void;
} {
  let current = { ...DEFAULT_SETTINGS, ...initial };
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(patch) {
      current = { ...current, ...patch };
      for (const listener of listeners) listener();
    },
  };
}

const theme = (id: ThemeSettings["id"]): ThemeSettings => ({ id, contrast: "AA", custom: {} });

function factory(options: {
  settings?: AppearanceSource;
  probe?: TerminalProbe;
  env?: NodeJS.ProcessEnv;
  created?: (appearance: ThemedAppearance) => void;
}): AppearanceFactory {
  return (_renderer, tui) => {
    const appearance = new ThemedAppearance({
      tui,
      probe: options.probe ?? staticProbe(UNKNOWN_PALETTE),
      settings: options.settings ?? settingsSource(),
      env: options.env ?? {},
    });
    options.created?.(appearance);
    return appearance;
  };
}

/** Mount `draw` with `createAppearance`, hand the renderer to `inspect`, then unmount. */
async function onScreen(
  createAppearance: AppearanceFactory,
  draw: (screen: Screen) => void,
  inspect: (setup: TestRendererSetup) => Promise<void>,
): Promise<void> {
  const { host, next } = createTestHost({ size: { cols: 80, rows: 24 }, createAppearance });
  let finish = (): void => {};
  const run = host.run((screen) => {
    draw(screen);
    return new Promise<void>((resolve) => (finish = resolve));
  });
  const setup = await next();
  await setup.renderOnce();
  await inspect(setup);
  finish();
  await run;
}

function spanOf(setup: TestRendererSetup, text: string): CapturedSpan {
  const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
  const span = spans.find((candidate) => candidate.text.includes(text));
  if (!span) throw new Error(`no span with ${text}`);
  return span;
}

const hexOf = (color: CapturedSpan["fg"]): string =>
  `#${color
    .toInts()
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

const TONES: readonly Tone[] = ["plain", "strong", "muted", "disabled", "accent", "success",
  "warning", "danger"];

/** A panel showing every tone, on the background and on the cursor row, plus the chrome. */
function everyTone(screen: Screen): void {
  const chrome = new Chrome(screen);
  chrome.setFacts(["12 mise(s) à jour"]);
  chrome.setHints("↑↓ naviguer · q quitter");
  const panel = new TextPanel(screen, chrome.body, { id: "p", title: "Paquets" });
  panel.setFocused(true);
  panel.show([
    TONES.map((tone) => seg(`${tone} `, tone)),
    TONES.map((tone) => seg(`${tone} `, tone, "highlight")),
  ]);
  new TextPanel(screen, chrome.body, { id: "q", title: "Menu", width: 12 });
}

describe("ThemedAppearance: the white-on-white fix", () => {
  it("paints plain text in the terminal's own colour when the palette is unknown", async () => {
    await onScreen(factory({}), everyTone, async (setup) => {
      expect(spanOf(setup, "plain").fg.intent).toBe("default");
      expect(spanOf(setup, "accent").fg).toMatchObject({ intent: "indexed", slot: 6 });
    });
  });

  it("gives the dialog's text field the terminal's colour too, in inverse video", async () => {
    let input: ReturnType<ThemedAppearance["input"]> | undefined;
    await onScreen(
      factory({ created: (appearance) => (input = appearance.input()) }),
      (screen) => {
        new Chrome(screen);
        const dialogs = new DialogLayer(screen);
        void dialogs.ask({ title: "Couleur", text: ["#RRGGBB"], default: "#FF8800" });
      },
      async (setup) => {
        // The dialog focuses its field on the next turn.
        await new Promise((resolve) => setTimeout(resolve, 10));
        await setup.renderOnce();
        expect(spanOf(setup, "#FF8800").fg.intent).toBe("default");
        expect(input?.textColor.intent).toBe("default");
        expect(input?.attributes).not.toBe(0);
      },
    );
  });
});

describe("ThemedAppearance: contrast on screen", () => {
  it.each([
    ["light", [0xf9, 0xfa, 0xfc]],
    ["dark", [0x0b, 0x0d, 0x13]],
    ["github-light", [0xff, 0xff, 0xff]],
  ] as const)("%s: every painted span reaches AA", async (id, background) => {
    const settings = settingsSource({ theme: theme(id) });
    await onScreen(factory({ settings }), everyTone, async (setup) => {
      const violations = frameContrastViolations(setup.captureSpans(), { ground: [...background] });
      expect(violations).toEqual([]);
      expect(spanOf(setup, "plain").fg.intent).toBe("rgb");
    });
  });

  it.each([
    ["Campbell", CAMPBELL],
    ["One Half Light", ONE_HALF_LIGHT],
  ] as const)("terminal theme on %s: every span reaches AA", async (_name, reported) => {
    const colors = detectedColorsFrom(reported)!;
    const probe = staticProbe({ ...UNKNOWN_PALETTE, colors });
    await onScreen(factory({ probe }), everyTone, async (setup) => {
      const ground: [number, number, number] = [
        colors.background.r,
        colors.background.g,
        colors.background.b,
      ];
      expect(frameContrastViolations(setup.captureSpans(), { ground })).toEqual([]);
      // The terminal's own background shows through: gup paints none.
      expect(spanOf(setup, "plain").bg.a).toBe(0);
    });
  });
});

describe("ThemedAppearance: live changes", () => {
  it("previews a theme on the whole screen, then puts the saved one back", async () => {
    let appearance: ThemedAppearance | undefined;
    const settings = settingsSource({ theme: theme("dark") });
    await onScreen(
      factory({ settings, created: (created) => (appearance = created) }),
      everyTone,
      async (setup) => {
        const darkTitle = hexOf(spanOf(setup, "gup").bg);
        appearance!.preview(theme("light"));
        await setup.renderOnce();
        expect(appearance!.resolved.effective).toBe("light");
        expect(hexOf(spanOf(setup, "gup").bg)).not.toBe(darkTitle);
        appearance!.endPreview();
        await setup.renderOnce();
        expect(hexOf(spanOf(setup, "gup").bg)).toBe(darkTitle);
        expect(settings.current().theme.id).toBe("dark");
      },
    );
  });

  it("follows the settings and tells its listeners", async () => {
    const settings = settingsSource({ theme: theme("dark") });
    const appearance = await standalone({ settings });
    const changed = vi.fn();
    appearance.onChange(changed);
    settings.set({ theme: theme("light"), density: "compact", glyphs: "ascii" });
    expect(changed).toHaveBeenCalledOnce();
    expect(appearance.resolved.effective).toBe("light");
    expect(appearance.density).toBe("compact");
    expect(appearance.glyphMode).toBe("ascii");
    expect(appearance.glyphs("✔ › à jour")).toBe("+ > à jour");
    expect(appearance.border(true).customChars).toBeDefined();
  });

  it("re-resolves when the terminal reports its palette", async () => {
    const probe = changingProbe(UNKNOWN_PALETTE);
    const appearance = await standalone({ probe });
    expect(appearance.resolved.mode).toBe("trusted");
    probe.report({ ...UNKNOWN_PALETTE, colors: detectedColorsFrom(CAMPBELL) });
    expect(appearance.resolved.mode).toBe("detected");
  });

  it("asks the terminal only for the themes that read it, and never under NO_COLOR", async () => {
    const idle = { ...UNKNOWN_PALETTE, detection: "idle" as const };
    const forTerminal = changingProbe(idle);
    await standalone({ probe: forTerminal });
    expect(forTerminal.detect).toHaveBeenCalledOnce();

    const forDark = changingProbe(idle);
    const darkSettings = settingsSource({ theme: theme("dark") });
    const dark = await standalone({ probe: forDark, settings: darkSettings });
    expect(forDark.detect).not.toHaveBeenCalled();
    dark.preview(theme("auto"));
    expect(forDark.detect).toHaveBeenCalledOnce();

    const noColor = changingProbe(idle);
    const monochrome = await standalone({ probe: noColor, env: { NO_COLOR: "1" } });
    expect(noColor.detect).not.toHaveBeenCalled();
    expect(monochrome.resolved.mode).toBe("monochrome");
  });

  it("settles the terminal's replies, then stops following anything, when disposed", async () => {
    const settings = settingsSource();
    const probe = changingProbe(UNKNOWN_PALETTE);
    const appearance = await standalone({ settings, probe });
    const changed = vi.fn();
    appearance.onChange(changed);
    await appearance.dispose();
    expect(probe.settle).toHaveBeenCalledWith(300);
    expect(probe.dispose).toHaveBeenCalled();
    settings.set({ theme: theme("dark") });
    expect(changed).not.toHaveBeenCalled();
    expect(appearance.resolved.effective).toBe("terminal");
  });

  it("lists every theme with what this terminal can paint", async () => {
    const probe = staticProbe({ ...UNKNOWN_PALETTE, depth: "16" });
    const appearance = await standalone({ probe });
    const unavailable = appearance.availability().filter((entry) => !entry.isAvailable);
    expect(unavailable.map((entry) => entry.id)).toContain("dark");
  });
});

describe("themedAppearance", () => {
  it("builds each screen's look from the settings, probing that screen's terminal", async () => {
    const settings = settingsSource({ theme: theme("dark") });
    await onScreen(themedAppearance(settings), everyTone, async (setup) => {
      expect(hexOf(spanOf(setup, "plain").fg)).toBe("#EDEEF2");
    });
  });
});

/** A probe the test drives: facts it can change, spies on every command. */
function changingProbe(
  initial: TerminalFacts,
): TerminalProbe & { report(facts: TerminalFacts): void } {
  let facts = initial;
  const listeners = new Set<() => void>();
  return {
    facts: () => facts,
    detect: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    onChange: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: vi.fn(),
    report(next) {
      facts = next;
      for (const listener of listeners) listener();
    },
  };
}

/** An appearance outside any screen (OpenTUI's module, no renderer). */
async function standalone(options: {
  settings?: AppearanceSource;
  probe?: TerminalProbe;
  env?: NodeJS.ProcessEnv;
}): Promise<ThemedAppearance> {
  return new ThemedAppearance({
    tui: await loadTui(),
    probe: options.probe ?? staticProbe(UNKNOWN_PALETTE),
    settings: options.settings ?? settingsSource(),
    env: options.env ?? {},
  });
}
