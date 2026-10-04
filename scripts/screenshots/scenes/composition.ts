import { installLogBackend, type LogBackend } from "../../../src/core/log/log.js";
import { isRecordedAt } from "../../../src/core/log/types.js";
import { getProvider } from "../../../src/core/registry.js";
import { setUiPreferencesSource } from "../../../src/ui/app/ui-preferences.js";
import { setLauncherFactory } from "../../../src/ui/app/update-launcher.js";
import {
  appearanceSource,
  menuPreferencesSource,
} from "../../../src/ui/settings/settings-sources.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import type { TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import { staticProbe } from "../../../src/ui/theme/runtime/terminal-probe.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { detectedColorsFrom } from "../../../src/ui/theme/terminal-palette.js";
import type { AppFixture } from "../fixtures/app-fixture.js";
import { DOCS_PALETTE } from "../render/docs-palette.js";

/** The debug log as `gup` writes it out of the box (`info`), here into nothing. */
const DEFAULT_LOG: LogBackend = {
  isEnabled: (level) => isRecordedAt(level, "info"),
  emit: () => {},
};

/**
 * The terminal of every screenshot, as gup's theme engine learns it: a
 * truecolor terminal answering the palette queries with the docs palette
 * (GitHub Dark Default), as Windows Terminal, iTerm2 or GNOME Terminal do.
 * The default `terminal` theme then follows it, every pair raised to AA.
 */
const DOCS_TERMINAL: TerminalFacts = {
  colors: detectedColorsFrom({
    defaultForeground: DOCS_PALETTE.foreground,
    defaultBackground: DOCS_PALETTE.background,
    palette: DOCS_PALETTE.ansi,
  }),
  themeMode: "dark",
  depth: "truecolor",
  detection: "done",
};

/** What a scene runs with, and how to put everything back afterwards. */
export interface Composition {
  /** The screens' look: the theme engine, on the scene's settings and the docs terminal. */
  readonly createAppearance: AppearanceFactory;
  /** Every slot this composition filled back to its default. */
  readonly undo: () => void;
}

/**
 * What `gup` wires before the menu opens — its CLI modules' startup hooks —
 * for one scene: the menu preferences read from the scene's settings, the
 * in-screen update launcher, a debug log at its default level, and the
 * theme engine for the screens. `undo` empties every slot again, so no scene
 * sees another's.
 */
export function compose(fixture: AppFixture): Composition {
  const { settings } = fixture;
  setUiPreferencesSource(menuPreferencesSource(settings, (id) => getProvider(id) !== undefined));
  setLauncherFactory(fixture.launcher);
  installLogBackend(DEFAULT_LOG);
  const probe = staticProbe(DOCS_TERMINAL);
  return {
    createAppearance: (_renderer, tui) =>
      new ThemedAppearance({ tui, probe, settings: appearanceSource(settings) }),
    undo: () => {
      installLogBackend(null);
      setLauncherFactory(null);
      setUiPreferencesSource(null);
    },
  };
}
