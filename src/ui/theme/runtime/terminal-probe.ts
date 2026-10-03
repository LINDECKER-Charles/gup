import type { CliRenderer, TerminalCapabilities, TerminalColors } from "@opentui/core";
import type { ColorDepth, TerminalFacts } from "../resolve-theme.js";
import { detectedColorsFrom, type DetectedColors } from "../terminal-palette.js";

/**
 * What gup learns about the terminal through OpenTUI: its palette (OSC 4 /
 * 10 / 11), whether its background is dark or light, and how many colours it
 * paints. Every query is bounded by a timeout and goes through OpenTUI —
 * gup never writes an escape sequence itself — and {@link TerminalProbe.settle}
 * waits for the ones in flight, so no late reply lands in the shell after
 * the screen is gone.
 *
 * The palette is asked once per process: the terminal does not change
 * between two screens of one run. A light/dark switch while gup runs clears
 * it, and OpenTUI re-reads it.
 */

export interface TerminalProbe {
  facts(): TerminalFacts;
  /**
   * Ask for the palette and theme mode, once per process; resolves (never
   * rejects) when they are settled or timed out.
   */
  detect(): Promise<void>;
  /** Wait (bounded) for the queries in flight. */
  settle(timeoutMs: number): Promise<void>;
  /** Called whenever {@link facts} changed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  dispose(): void;
}

/** The part of the renderer the probe reads: real in the app, faked in tests. */
export type PaletteHost = Pick<
  CliRenderer,
  "getPalette" | "themeMode" | "waitForThemeMode" | "capabilities" | "on" | "off"
>;

/** How long a terminal may take to answer the palette queries. */
const PALETTE_TIMEOUT_MS = 1000;
const PALETTE_SIZE = 16;
/** How long to wait for the background's lightness when the renderer does not know it yet. */
const THEME_MODE_WAIT_MS = 250;

/** The palette of this process's terminal: undefined until asked, null when it did not answer. */
let processColors: DetectedColors | null | undefined;

/** Forget the process-wide palette. Exported for tests only: a process keeps its terminal. */
export function resetProbeCache(): void {
  processColors = undefined;
}

export function depthOf(capabilities: TerminalCapabilities | null): ColorDepth {
  if (!capabilities) return "unknown";
  if (capabilities.rgb) return "truecolor";
  return capabilities.ansi256 ? "256" : "16";
}

/** A probe whose facts never change (tests, screens without a terminal). */
export function staticProbe(facts: TerminalFacts): TerminalProbe {
  return {
    facts: () => facts,
    detect: async () => {},
    settle: async () => {},
    onChange: () => () => {},
    dispose: () => {},
  };
}

export function rendererProbe(renderer: PaletteHost): TerminalProbe {
  return new RendererProbe(renderer);
}

class RendererProbe implements TerminalProbe {
  readonly #renderer: PaletteHost;
  readonly #listeners = new Set<() => void>();
  readonly #unwatch: () => void;
  #detection: TerminalFacts["detection"];
  #inFlight: Promise<void> | null = null;

  constructor(renderer: PaletteHost) {
    this.#renderer = renderer;
    this.#detection = processColors === undefined ? "idle" : "done";
    this.#unwatch = this.#watch();
  }

  facts(): TerminalFacts {
    return {
      colors: processColors ?? null,
      themeMode: this.#renderer.themeMode,
      depth: depthOf(this.#renderer.capabilities),
      detection: this.#detection,
    };
  }

  detect(): Promise<void> {
    if (this.#detection !== "idle") return this.#inFlight ?? Promise.resolve();
    this.#detection = "pending";
    this.#inFlight = Promise.all([this.#readPalette(), this.#readThemeMode()])
      .catch(() => undefined)
      .then(() => {
        this.#detection = "done";
        this.#inFlight = null;
        this.#notify();
      });
    return this.#inFlight;
  }

  async settle(timeoutMs: number): Promise<void> {
    const pending = this.#inFlight;
    if (!pending) return;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)));
    await Promise.race([pending, deadline]);
    clearTimeout(timer);
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#unwatch();
    this.#listeners.clear();
  }

  /** The palette, unless this process already has it. A suspended renderer throws: unknown. */
  async #readPalette(): Promise<void> {
    if (processColors !== undefined) return;
    try {
      const reported = await this.#renderer.getPalette({
        size: PALETTE_SIZE,
        timeout: PALETTE_TIMEOUT_MS,
      });
      processColors = detectedColorsFrom(reported);
    } catch {
      processColors = null;
    }
  }

  async #readThemeMode(): Promise<void> {
    if (this.#renderer.themeMode === null) {
      await this.#renderer.waitForThemeMode(THEME_MODE_WAIT_MS);
    }
  }

  /**
   * The terminal changed under gup: a new palette (OpenTUI re-reads it after
   * a light/dark switch), a new background lightness, its capabilities.
   */
  #watch(): () => void {
    const onPalette = (colors: TerminalColors): void => {
      processColors = detectedColorsFrom(colors);
      this.#notify();
    };
    const onOther = (): void => this.#notify();
    this.#renderer.on("palette", onPalette);
    this.#renderer.on("theme_mode", onOther);
    this.#renderer.on("capabilities", onOther);
    return () => {
      this.#renderer.off("palette", onPalette);
      this.#renderer.off("theme_mode", onOther);
      this.#renderer.off("capabilities", onOther);
    };
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
