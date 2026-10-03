import type { CustomColors, ThemeSettings } from "../../../settings/theme-section.js";
import { fromOklch, toOklch, type Oklch } from "../../../theme/color/oklch.js";
import { BLACK, parseHex, toHex, worstRatio, type Rgb } from "../../../theme/color/rgb.js";
import type { Correction } from "../../../theme/enforce-contrast.js";
import {
  CUSTOMIZABLE_TOKENS,
  type ColorToken,
  type CustomizableToken,
  type ThemeId,
} from "../../../theme/palette.js";
import type { ResolvedTheme } from "../../../theme/resolve-theme.js";
import {
  COLOR_EDITOR,
  formatRatio,
  formatRatioValue,
  HEX_DIALOG,
  ROLE_LABELS,
  THEME_LABELS,
} from "../../../text/theme-labels.js";
import type { KeyPress } from "../../../tui/screen-host.js";
import {
  fillLine,
  fit,
  seg,
  wrap,
  type Line,
  type Segment,
  type Tone,
} from "../../../tui/styled-lines.js";
import type { Viewport } from "../../panel.js";
import type { OptionsControls, OptionsHost, OptionsView } from "../option-row.js";
import { clipLine } from "../settings-list.js";

export interface ColorEditorDeps {
  readonly controls: OptionsControls;
  readonly host: OptionsHost;
}

const ROLE_WIDTH = 17;
const HEX_WIDTH = 9;
const RATIO_WIDTH = 16;
const HUE_STEP_DEGREES = 10;
const LIGHTNESS_STEP = 0.03;
const DEGREES_PER_TURN = 360;
/** Between the base theme line and the first role: a blank and the column headings. */
const TABLE_HEADING_ROWS = 2;
const GROUNDS: ReadonlySet<CustomizableToken> = new Set(["background", "highlight"]);
const SAMPLE_TONE: Readonly<Record<CustomizableToken, Tone>> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  text: "plain",
  muted: "muted",
  background: "muted",
  highlight: "plain",
};

/** A colour being nudged: previewed on the whole app, saved when the user moves on. */
interface Draft {
  readonly token: CustomizableToken;
  readonly color: Oklch;
}

/**
 * The colours of the saved theme, role by role: what the user chose, what is
 * painted, its contrast — and, when the choice was unreadable, the colour it
 * was moved to (`2,1 → 4,6:1 ⚠`). The choice is kept as typed until `a`
 * stores the adjusted value. Hue and lightness nudges preview on the whole
 * app and are saved when the user changes role or leaves, never on every key.
 */
export class ColorEditor implements OptionsView {
  readonly title = COLOR_EDITOR.title;
  readonly #deps: ColorEditorDeps;
  /** The theme these colours belong to. */
  readonly #base: ThemeId;
  #cursor = 0;
  #draft: Draft | null = null;

  constructor(deps: ColorEditorDeps) {
    this.#deps = deps;
    this.#base = deps.host.settings.get("theme").id;
  }

  hints(): string {
    return COLOR_EDITOR.hints;
  }

  render(viewport: Viewport): readonly Line[] {
    const theme = this.#deps.host.appearance.resolved();
    const customs = this.customs();
    const rows = CUSTOMIZABLE_TOKENS.map((token, index): Line => {
      const line = clipLine(roleCells(token, theme, customs[token]), viewport.width - 2);
      if (index !== this.#cursor) return [seg("  "), ...line];
      return fillLine([seg("› ", "accent"), ...line], viewport.width, "highlight");
    });
    return [
      ...this.baseLines(viewport.width),
      [],
      [seg(`  ${columnHeadings()}`, "muted")],
      ...rows,
      ...footer(theme, viewport.width),
    ];
  }

  press(key: KeyPress): void {
    this.actions()[key.name]?.();
  }

  click(row: number, viewport: Viewport): void {
    const index = row - this.baseLines(viewport.width).length - TABLE_HEADING_ROWS;
    if (index >= 0 && index < CUSTOMIZABLE_TOKENS.length) this.select(index);
  }

  private actions(): Readonly<Record<string, () => void>> {
    const hue = (direction: number) => () => this.nudge({ hue: direction * HUE_STEP_DEGREES });
    const lightness = (direction: number) => () =>
      this.nudge({ lightness: direction * LIGHTNESS_STEP });
    return {
      up: () => this.select(this.#cursor - 1),
      k: () => this.select(this.#cursor - 1),
      down: () => this.select(this.#cursor + 1),
      j: () => this.select(this.#cursor + 1),
      left: hue(-1),
      h: hue(-1),
      right: hue(1),
      l: hue(1),
      "+": lightness(1),
      "-": lightness(-1),
      return: () => void this.askHex(),
      enter: () => void this.askHex(),
      space: () => void this.askHex(),
      a: () => this.keepAdjusted(),
      delete: () => this.resetRole(),
      backspace: () => this.resetRole(),
      escape: () => this.leave(),
    };
  }

  private get token(): CustomizableToken {
    return CUSTOMIZABLE_TOKENS[this.#cursor] ?? "accent";
  }

  /** Which theme the colours belong to, above the table. */
  private baseLines(width: number): Line[] {
    return wrapped(COLOR_EDITOR.base(THEME_LABELS[this.#base]), width, "muted");
  }

  private savedCustoms(): CustomColors {
    return this.#deps.host.settings.get("theme").custom[this.#base] ?? {};
  }

  /** The saved colours with the draft over them. */
  private customs(): CustomColors {
    const draft = this.#draft;
    if (!draft) return this.savedCustoms();
    return { ...this.savedCustoms(), [draft.token]: toHex(fromOklch(draft.color)) };
  }

  private select(index: number): void {
    this.commitDraft();
    this.#cursor = Math.min(CUSTOMIZABLE_TOKENS.length - 1, Math.max(0, index));
  }

  private nudge(change: { readonly hue?: number; readonly lightness?: number }): void {
    const { token } = this;
    const start = this.#draft?.token === token ? this.#draft.color : toOklch(this.colorOf(token));
    this.#draft = {
      token,
      color: {
        l: Math.min(1, Math.max(0, start.l + (change.lightness ?? 0))),
        c: start.c,
        h: (start.h + (change.hue ?? 0) + DEGREES_PER_TURN) % DEGREES_PER_TURN,
      },
    };
    const theme = this.#deps.host.settings.get("theme");
    this.#deps.host.appearance.preview({
      ...theme,
      custom: withThemeColors(theme.custom, this.#base, this.customs()),
    });
  }

  /** What the role shows now: the user's colour, else the painted one. */
  private colorOf(token: CustomizableToken): Rgb {
    const chosen = parseHex(this.savedCustoms()[token] ?? "");
    return chosen ?? this.#deps.host.appearance.resolved().palette?.[token] ?? BLACK;
  }

  private commitDraft(): void {
    if (!this.#draft) return;
    const customs = this.customs();
    this.#draft = null;
    this.saveCustoms(customs);
    this.#deps.host.appearance.endPreview();
  }

  private async askHex(): Promise<void> {
    this.commitDraft();
    const { host } = this.#deps;
    const { token } = this;
    const answer = await host.dialogs.ask({
      title: HEX_DIALOG.title(ROLE_LABELS[token]),
      text: [HEX_DIALOG.text],
      default: toHex(this.colorOf(token)),
      validate: (value) => (parseHex(value) ? true : HEX_DIALOG.invalid),
    });
    const color = parseHex(answer ?? "");
    if (color) this.saveCustoms({ ...this.savedCustoms(), [token]: toHex(color) });
    host.redraw();
  }

  /** `a`: every adjusted role keeps the colour it is painted with. */
  private keepAdjusted(): void {
    this.commitDraft();
    const adjusted = this.#deps.host.appearance
      .resolved()
      .report.corrections.filter((correction) => isCustomizable(correction.token))
      .map((correction) => [correction.token, toHex(correction.applied)] as const);
    if (adjusted.length === 0) return;
    this.saveCustoms({ ...this.savedCustoms(), ...Object.fromEntries(adjusted) });
  }

  /** Suppr: the role follows the theme again. */
  private resetRole(): void {
    this.#draft = null;
    this.#deps.host.appearance.endPreview();
    const { [this.token]: _removed, ...others } = this.savedCustoms();
    this.saveCustoms(others);
  }

  private leave(): void {
    this.commitDraft();
    this.#deps.controls.close();
  }

  private saveCustoms(colors: CustomColors): void {
    const { controls, host } = this.#deps;
    const custom = withThemeColors(host.settings.get("theme").custom, this.#base, colors);
    controls.save(() => host.settings.update("theme", { custom }));
  }
}

function isCustomizable(token: ColorToken): token is CustomizableToken {
  return (CUSTOMIZABLE_TOKENS as readonly ColorToken[]).includes(token);
}

/** The per-theme colours with `id`'s replaced (dropped when empty). */
function withThemeColors(
  custom: ThemeSettings["custom"],
  id: ThemeId,
  colors: CustomColors,
): ThemeSettings["custom"] {
  const { [id]: _previous, ...others } = custom;
  return Object.keys(colors).length > 0 ? { ...others, [id]: colors } : others;
}

function columnHeadings(): string {
  const { role, chosen, shown, ratio, sample } = COLOR_EDITOR.columns;
  return [
    fit(role, ROLE_WIDTH),
    fit(chosen, HEX_WIDTH),
    fit(shown, HEX_WIDTH),
    fit(ratio, RATIO_WIDTH),
    sample,
  ].join("");
}

function roleCells(
  token: CustomizableToken,
  theme: ResolvedTheme,
  chosen: string | undefined,
): Line {
  const shown = theme.palette?.[token];
  const correction = theme.report.corrections.find((candidate) => candidate.token === token);
  return [
    seg(fit(ROLE_LABELS[token], ROLE_WIDTH)),
    seg(fit(chosen ?? COLOR_EDITOR.themeValue, HEX_WIDTH), chosen ? "plain" : "muted"),
    seg(fit(shown ? toHex(shown) : "", HEX_WIDTH)),
    ratioCell(token, theme, correction),
    token === "highlight"
      ? seg(COLOR_EDITOR.samples[token], SAMPLE_TONE[token], "highlight")
      : seg(COLOR_EDITOR.samples[token], SAMPLE_TONE[token]),
  ];
}

/** Grounds: "—" (or "ajusté ⚠"); text roles: their worst ratio, or before → after. */
function ratioCell(
  token: CustomizableToken,
  theme: ResolvedTheme,
  correction: Correction | undefined,
): Segment {
  if (GROUNDS.has(token)) {
    return correction
      ? seg(fit(COLOR_EDITOR.groundCorrected, RATIO_WIDTH), "warning")
      : seg(fit(COLOR_EDITOR.ground, RATIO_WIDTH), "muted");
  }
  const { palette } = theme;
  if (!palette) return seg(fit(COLOR_EDITOR.ground, RATIO_WIDTH), "muted");
  const ratio = formatRatio(worstRatio(palette[token], [palette.background, palette.highlight]));
  if (!correction) return seg(fit(`${ratio}  ✔`, RATIO_WIDTH), "success");
  return seg(fit(`${formatRatioValue(correction.before)} → ${ratio} ⚠`, RATIO_WIDTH), "warning");
}

/** The warning under the table when some colours had to be adjusted. */
function footer(theme: ResolvedTheme, width: number): Line[] {
  const adjusted = theme.report.corrections.filter((correction) =>
    isCustomizable(correction.token),
  );
  if (adjusted.length === 0) return [];
  const text = COLOR_EDITOR.corrected(adjusted.length, theme.report.level);
  return [[], ...wrapped(text, width, "warning")];
}

function wrapped(text: string, width: number, tone: Tone): Line[] {
  return wrap(text, Math.max(1, width)).map((part): Line => [seg(part, tone)]);
}
