import { describe, expect, it } from "vitest";
import {
  unreportedColors,
  type UnreportedColor,
  type UnreportedRole,
  type UnreportedTerminal,
} from "../../../src/ui/theme/color/unreported-palette.js";
import { CONTRAST_LEVELS } from "../../../src/ui/theme/palette.js";
import type { ReportedColors } from "../../../src/ui/theme/terminal-palette.js";
import * as wcag from "../../support/contrast/wcag.js";
import {
  CAMPBELL,
  GNOME_TANGO_DARK,
  ITERM2_DEFAULT,
  TERMINAL_APP_BASIC,
  WINDOWS_CONSOLE_LEGACY,
  XTERM_DEFAULT,
} from "../../support/tui/reference-palettes.js";

/**
 * The colours gup paints with when the terminal reports no palette, held
 * against the real defaults of the terminals it may be talking to — measured
 * with the independent WCAG oracle, never with the production maths.
 */

const TEXT_ROLES: readonly UnreportedRole[] = ["accent", "success", "warning", "danger"];
const BORDER_ROLES: readonly UnreportedRole[] = ["borderIdle", "borderFocus"];
const TEXT_MINIMUM = {
  AA: wcag.WCAG_MIN_CONTRAST.text,
  AAA: wcag.WCAG_MIN_CONTRAST.enhancedText,
} as const;

/** What the terminal really shows for `color`, on its own palette. */
function shown(color: UnreportedColor, palette: ReportedColors): wcag.Rgb {
  const hex = color.kind === "slot" ? palette.palette[color.slot] : palette.defaultForeground;
  return wcag.parseHexColor(hex ?? "");
}

function ratioOn(color: UnreportedColor, palette: ReportedColors): number {
  return wcag.contrastRatio(shown(color, palette), wcag.parseHexColor(palette.defaultBackground!));
}

/**
 * Each terminal as gup sees it when no palette comes back — the Windows
 * console never answers; elsewhere a terminal may tell its lightness alone —
 * with the palette it really has.
 */
const WINDOWS: UnreportedTerminal = { platform: "win32", themeMode: null };
const SILENT: ReadonlyArray<readonly [string, UnreportedTerminal, ReportedColors]> = [
  ["the Windows console and Windows Terminal (Campbell)", WINDOWS, CAMPBELL],
  ["a Windows console set up before 1709", WINDOWS, WINDOWS_CONSOLE_LEGACY],
  [
    "Terminal.app's light Basic profile",
    { platform: "darwin", themeMode: "light" },
    TERMINAL_APP_BASIC,
  ],
  ["iTerm2's default profile", { platform: "darwin", themeMode: "dark" }, ITERM2_DEFAULT],
  ["GNOME Terminal (Tango dark)", { platform: "linux", themeMode: "dark" }, GNOME_TANGO_DARK],
  ["xterm (black on white)", { platform: "linux", themeMode: "light" }, XTERM_DEFAULT],
];

describe("unreportedColors on the defaults of terminals that report no palette", () => {
  const cases = SILENT.flatMap(([label, terminal, palette]) =>
    CONTRAST_LEVELS.map((level) => ({ label, terminal, palette, level })),
  );
  it.each(cases)(
    "every coloured text and border reads on $label ($level)",
    ({ terminal, palette, level }) => {
      const colors = unreportedColors(terminal, level);
      for (const role of TEXT_ROLES) {
        expect(ratioOn(colors[role], palette), role).toBeGreaterThanOrEqual(TEXT_MINIMUM[level]);
      }
      for (const role of BORDER_ROLES) {
        expect(ratioOn(colors[role], palette), role).toBeGreaterThanOrEqual(
          wcag.WCAG_MIN_CONTRAST.nonText,
        );
      }
    },
  );

  it("never reads worse than the slots of a reported palette on a light default", () => {
    const usual: Record<UnreportedRole, UnreportedColor> = {
      danger: { kind: "slot", slot: 1 },
      success: { kind: "slot", slot: 2 },
      warning: { kind: "slot", slot: 3 },
      accent: { kind: "slot", slot: 6 },
      borderIdle: { kind: "slot", slot: 8 },
      borderFocus: { kind: "slot", slot: 6 },
    };
    for (const palette of [TERMINAL_APP_BASIC, XTERM_DEFAULT]) {
      const colors = unreportedColors({ platform: "darwin", themeMode: "light" }, "AA");
      for (const role of [...TEXT_ROLES, ...BORDER_ROLES]) {
        expect(ratioOn(colors[role], palette), role).toBeGreaterThanOrEqual(
          ratioOn(usual[role], palette),
        );
      }
    }
  });

  it("keeps a colour where the slot reads: the console's yellow and borders stay its own", () => {
    const colors = unreportedColors(WINDOWS, "AA");
    expect(colors).toEqual({
      danger: { kind: "slot", slot: 9 },
      success: { kind: "slot", slot: 10 },
      warning: { kind: "slot", slot: 3 },
      accent: { kind: "slot", slot: 14 },
      borderIdle: { kind: "slot", slot: 8 },
      borderFocus: { kind: "slot", slot: 6 },
    });
  });

  it.each([
    ["linux", null],
    ["darwin", null],
  ] as const)("guesses nothing on %s when the terminal said nothing at all", (platform, mode) => {
    expect(unreportedColors({ platform, themeMode: mode }, "AA")).toEqual({
      danger: { kind: "slot", slot: 1 },
      success: { kind: "slot", slot: 2 },
      warning: { kind: "slot", slot: 3 },
      accent: { kind: "slot", slot: 6 },
      borderIdle: { kind: "slot", slot: 8 },
      borderFocus: { kind: "slot", slot: 6 },
    });
  });
});
