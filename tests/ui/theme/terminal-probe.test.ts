import { EventEmitter } from "node:events";
import type { TerminalCapabilities, TerminalColors, ThemeMode } from "@opentui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toHex } from "../../../src/ui/theme/color/rgb.js";
import {
  depthOf,
  rendererProbe,
  resetProbeCache,
  type PaletteHost,
} from "../../../src/ui/theme/runtime/terminal-probe.js";
import type { ReportedColors } from "../../../src/ui/theme/terminal-palette.js";
import { CAMPBELL, ONE_HALF_LIGHT, UNSUPPORTED } from "../../support/tui/reference-palettes.js";

/** OpenTUI's full answer for a reported palette. */
function answer(reported: ReportedColors): TerminalColors {
  return {
    palette: [...reported.palette],
    defaultForeground: reported.defaultForeground,
    defaultBackground: reported.defaultBackground,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  };
}

/** The renderer surface the probe reads, with a scriptable terminal behind it. */
class FakeRenderer extends EventEmitter {
  themeMode: ThemeMode | null = null;
  capabilities: Partial<TerminalCapabilities> | null = null;
  readonly getPalette = vi.fn(async (): Promise<TerminalColors> => answer(CAMPBELL));
  readonly waitForThemeMode = vi.fn(async (): Promise<ThemeMode | null> => this.themeMode);

  asHost(): PaletteHost {
    return this as unknown as PaletteHost;
  }
}

afterEach(() => {
  resetProbeCache();
});

describe("rendererProbe", () => {
  it("asks nothing until detection is requested", () => {
    const renderer = new FakeRenderer();
    const probe = rendererProbe(renderer.asHost());
    expect(probe.facts()).toEqual({
      colors: null,
      themeMode: null,
      depth: "unknown",
      detection: "idle",
    });
    expect(renderer.getPalette).not.toHaveBeenCalled();
  });

  it("reads the palette once, bounded, then reports it", async () => {
    const renderer = new FakeRenderer();
    const probe = rendererProbe(renderer.asHost());
    const changed = vi.fn();
    probe.onChange(changed);
    const detecting = probe.detect();
    expect(probe.facts().detection).toBe("pending");
    await detecting;
    expect(renderer.getPalette).toHaveBeenCalledWith({ size: 16, timeout: 1000 });
    expect(probe.facts().detection).toBe("done");
    expect(toHex(probe.facts().colors!.background)).toBe("#0C0C0C");
    expect(changed).toHaveBeenCalled();
  });

  it("asks the terminal once per process, whatever the number of screens", async () => {
    const first = new FakeRenderer();
    await rendererProbe(first.asHost()).detect();
    const second = new FakeRenderer();
    const probe = rendererProbe(second.asHost());
    expect(probe.facts().detection).toBe("done");
    await probe.detect();
    expect(second.getPalette).not.toHaveBeenCalled();
    expect(probe.facts().colors).not.toBeNull();
  });

  it("settles on 'unknown' when the terminal does not answer or the renderer refuses", async () => {
    const silent = new FakeRenderer();
    silent.getPalette.mockResolvedValue(answer(UNSUPPORTED));
    const probe = rendererProbe(silent.asHost());
    await probe.detect();
    expect(probe.facts()).toMatchObject({ colors: null, detection: "done" });

    resetProbeCache();
    const suspended = new FakeRenderer();
    suspended.getPalette.mockRejectedValue(new Error("Cannot detect palette while suspended"));
    const refused = rendererProbe(suspended.asHost());
    await expect(refused.detect()).resolves.toBeUndefined();
    expect(refused.facts()).toMatchObject({ colors: null, detection: "done" });
  });

  it("waits briefly for the background's lightness when the renderer lacks it", async () => {
    const renderer = new FakeRenderer();
    await rendererProbe(renderer.asHost()).detect();
    expect(renderer.waitForThemeMode).toHaveBeenCalledWith(250);
    const known = new FakeRenderer();
    known.themeMode = "light";
    await rendererProbe(known.asHost()).detect();
    expect(known.waitForThemeMode).not.toHaveBeenCalled();
  });

  it("follows the terminal: a new palette, a light/dark switch, new capabilities", () => {
    const renderer = new FakeRenderer();
    const probe = rendererProbe(renderer.asHost());
    const changed = vi.fn();
    probe.onChange(changed);
    renderer.emit("palette", answer(ONE_HALF_LIGHT));
    expect(toHex(probe.facts().colors!.background)).toBe("#FAFAFA");
    renderer.themeMode = "light";
    renderer.emit("theme_mode", "light");
    expect(probe.facts().themeMode).toBe("light");
    renderer.capabilities = { rgb: false, ansi256: true };
    renderer.emit("capabilities", renderer.capabilities);
    expect(probe.facts().depth).toBe("256");
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("waits for a query in flight at teardown, never longer than asked", async () => {
    const renderer = new FakeRenderer();
    renderer.getPalette.mockReturnValue(new Promise(() => {}));
    const probe = rendererProbe(renderer.asHost());
    void probe.detect();
    const started = Date.now();
    await probe.settle(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("stops listening to the renderer once disposed", () => {
    const renderer = new FakeRenderer();
    const probe = rendererProbe(renderer.asHost());
    probe.dispose();
    expect(renderer.listenerCount("palette")).toBe(0);
    expect(renderer.listenerCount("theme_mode")).toBe(0);
    expect(renderer.listenerCount("capabilities")).toBe(0);
  });
});

describe("depthOf", () => {
  it("maps OpenTUI's capabilities to a colour depth", () => {
    const caps = (rgb: boolean, ansi256: boolean): TerminalCapabilities =>
      ({ rgb, ansi256 }) as TerminalCapabilities;
    expect(depthOf(null)).toBe("unknown");
    expect(depthOf(caps(true, true))).toBe("truecolor");
    expect(depthOf(caps(false, true))).toBe("256");
    expect(depthOf(caps(false, false))).toBe("16");
  });
});
