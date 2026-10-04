import type { CliRenderer, RGBA } from "@opentui/core";
import { log } from "../../../core/log/log.js";
import type { ThemeSettings } from "../../settings/theme-section.js";
import type { Tui } from "../../tui/load-tui.js";
import type { Fill, Tone } from "../../tui/styled-lines.js";
import type {
  Appearance,
  AppearanceFactory,
  BorderLook,
  ChunkStyle,
  Density,
  InputLook,
} from "../appearance.js";
import { resolveGlyphMode, toAscii, type GlyphMode, type GlyphPreference } from "../glyphs.js";
import {
  isNoColor,
  needsDetection,
  resolveTheme,
  themeAvailability,
  type ResolvedTheme,
  type ResolveInput,
  type ThemeAvailability,
} from "../resolve-theme.js";
import { buildThemePaint } from "../style-table.js";
import { ScreenLook } from "./screen-look.js";
import { rendererProbe, type TerminalProbe } from "./terminal-probe.js";

/**
 * The theme engine's appearance for one screen: the user's theme, resolved
 * against what the terminal reports, painted with contrast enforced on every
 * pair. It follows the settings live, re-resolves when the terminal answers
 * (palette, light/dark, colour depth), and can preview another theme on the
 * whole screen before it is saved.
 *
 * Plain text is always painted with an explicit colour — the theme's text
 * colour, or the terminal's own foreground — never left to OpenTUI's white
 * default, which disappeared on light terminals.
 */

/** What the appearance reads from the settings. */
export interface AppearanceSettings {
  readonly theme: ThemeSettings;
  readonly glyphs: GlyphPreference;
  readonly density: Density;
}

export interface AppearanceSource {
  current(): AppearanceSettings;
  /** `listener` runs after any of them changed. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface ThemedAppearanceDeps {
  readonly tui: Tui;
  readonly probe: TerminalProbe;
  readonly settings: AppearanceSource;
  /** Default: `process.env` (`NO_COLOR`, the glyph heuristics). */
  readonly env?: NodeJS.ProcessEnv;
  /** Default: `process.platform` (the colours of a terminal that reports none). */
  readonly platform?: NodeJS.Platform;
}

/** How long the end of a screen waits for palette replies still in flight. */
const SETTLE_TIMEOUT_MS = 300;

/** Everything derived from one resolve. */
interface Rendering {
  readonly resolved: ResolvedTheme;
  readonly look: ScreenLook;
  readonly glyphMode: GlyphMode;
}

export class ThemedAppearance implements Appearance {
  readonly #deps: ThemedAppearanceDeps;
  readonly #env: NodeJS.ProcessEnv;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  #settings: AppearanceSettings;
  #preview: ThemeSettings | null = null;
  #rendering: Rendering;
  /** Every theme resolved: computed when asked, kept until the next re-resolve. */
  #availability: ThemeAvailability[] | null = null;

  constructor(deps: ThemedAppearanceDeps) {
    this.#deps = deps;
    this.#env = deps.env ?? process.env;
    this.#settings = deps.settings.current();
    this.#rendering = this.#render();
    this.#detectIfNeeded();
    const stopSettings = deps.settings.subscribe(() => {
      this.#settings = deps.settings.current();
      this.#refresh();
    });
    const stopProbe = deps.probe.onChange(() => this.#refresh());
    this.#stopWatching = () => {
      stopSettings();
      stopProbe();
    };
  }

  /** The theme as painted now (the preview while one is shown). */
  get resolved(): ResolvedTheme {
    return this.#rendering.resolved;
  }

  get glyphMode(): GlyphMode {
    return this.#rendering.glyphMode;
  }

  get density(): Density {
    return this.#settings.density;
  }

  /** True while a theme other than the saved one is painted. */
  get isPreviewing(): boolean {
    return this.#preview !== null;
  }

  style(tone: Tone, fill?: Fill): ChunkStyle {
    return this.#rendering.look.style(tone, fill);
  }

  border(isFocused: boolean): BorderLook {
    return this.#rendering.look.border(isFocused);
  }

  background(): RGBA | "transparent" {
    return this.#rendering.look.background();
  }

  input(): InputLook {
    return this.#rendering.look.input();
  }

  glyphs(text: string): string {
    return this.#rendering.glyphMode === "ascii" ? toAscii(text) : text;
  }

  /** Every theme, as it would resolve on this terminal with the current settings. */
  availability(): ThemeAvailability[] {
    this.#availability ??= themeAvailability(this.#input(this.#settings.theme));
    return this.#availability;
  }

  /** Paint the whole screen with `theme` until {@link endPreview}; nothing is saved. */
  preview(theme: ThemeSettings): void {
    this.#preview = theme;
    this.#refresh();
  }

  endPreview(): void {
    if (this.#preview === null) return;
    this.#preview = null;
    this.#refresh();
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stop following settings and terminal, and let palette replies in flight land. */
  async dispose(): Promise<void> {
    this.#stopWatching();
    this.#listeners.clear();
    try {
      await this.#deps.probe.settle(SETTLE_TIMEOUT_MS);
    } finally {
      this.#deps.probe.dispose();
    }
  }

  #input(theme: ThemeSettings): ResolveInput {
    return {
      settings: theme,
      terminal: this.#deps.probe.facts(),
      isNoColor: isNoColor(this.#env),
      ...(this.#deps.platform !== undefined && { platform: this.#deps.platform }),
    };
  }

  #theme(): ThemeSettings {
    return this.#preview ?? this.#settings.theme;
  }

  #render(): Rendering {
    const resolved = resolveTheme(this.#input(this.#theme()));
    const glyphMode = resolveGlyphMode(this.#settings.glyphs, this.#env);
    const look = new ScreenLook(this.#deps.tui, buildThemePaint(resolved), glyphMode);
    return { resolved, look, glyphMode };
  }

  /** Ask the terminal only for the themes that read it, once, and never under NO_COLOR. */
  #detectIfNeeded(): void {
    const isIdle = this.#deps.probe.facts().detection === "idle";
    if (isIdle && !isNoColor(this.#env) && needsDetection(this.#theme().id)) {
      void this.#deps.probe.detect();
    }
  }

  #refresh(): void {
    this.#rendering = this.#render();
    this.#availability = null;
    this.#detectIfNeeded();
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch (error) {
        log.warn("ui.appearance-listener-failed", { error: messageOf(error) });
      }
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The screens' appearance: the theme engine over `settings`, probing each screen's terminal. */
export function themedAppearance(settings: AppearanceSource): AppearanceFactory {
  return (renderer: CliRenderer, tui: Tui) =>
    new ThemedAppearance({ tui, probe: rendererProbe(renderer), settings });
}
