import type { HexColor } from "../../../../core/config/field-reader.js";
import type { CustomColors } from "../../../settings/theme-section.js";
import { toHex, worstRatio } from "../../../theme/color/rgb.js";
import { adjustedRoles } from "../../../theme/enforce-contrast.js";
import { STATUS_GLYPHS } from "../../../theme/glyphs.js";
import { CUSTOMIZABLE_TOKENS, type CustomizableToken } from "../../../theme/palette.js";
import type { ResolvedTheme } from "../../../theme/resolve-theme.js";
import {
  COLOR_EDITOR,
  formatRatio,
  formatRatioValue,
  ROLE_LABELS,
} from "../../../text/settings/theme-labels.js";
import {
  fillLine,
  fit,
  seg,
  wrap,
  type Line,
  type Segment,
  type Tone,
} from "../../../tui/styled-lines.js";
import { clipLine } from "../settings-list.js";

/**
 * The colour editor's table, as lines: one row per tunable role — the colour
 * chosen (or "(thème)"), the colour painted, its contrast on the grounds
 * (`2,1 → 4,6:1 ‼` when an unreadable choice was moved), a sample painted
 * with it — and the warning under it when colours had to be adjusted.
 *
 * On a narrow panel the painted colour's column is left out: the contrast
 * cell already says when it differs from the choice, and the whole screen is
 * painted with it anyway.
 */

export interface ColorTable {
  readonly theme: ResolvedTheme;
  /** The colours chosen for the theme, a colour being nudged included. */
  readonly customs: CustomColors;
  /** Index of the role under the cursor in {@link CUSTOMIZABLE_TOKENS}. */
  readonly cursor: number;
}

interface RoleCell {
  readonly token: CustomizableToken;
  readonly theme: ResolvedTheme;
  readonly chosen: HexColor | undefined;
}

interface Column {
  readonly heading: string;
  /** Fixed width; 0 for the last column, which takes what is left. */
  readonly width: number;
  cell(role: RoleCell): Segment;
}

const GUTTER = "  ";
const ROLE_WIDTH = 17;
const HEX_WIDTH = 9;
const RATIO_WIDTH = 16;
/** The widest ratio, 21:1: a shorter one is padded to it, so every √ stands in one column. */
const RATIO_TEXT_WIDTH = formatRatio(21).length;
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

const ROLE: Column = {
  heading: COLOR_EDITOR.columns.role,
  width: ROLE_WIDTH,
  cell: ({ token }) => seg(fit(ROLE_LABELS[token], ROLE_WIDTH)),
};
const CHOSEN: Column = {
  heading: COLOR_EDITOR.columns.chosen,
  width: HEX_WIDTH,
  cell: ({ chosen }) =>
    seg(fit(chosen ?? COLOR_EDITOR.themeValue, HEX_WIDTH), chosen ? "plain" : "muted"),
};
const SHOWN: Column = {
  heading: COLOR_EDITOR.columns.shown,
  width: HEX_WIDTH,
  cell: ({ token, theme }) => {
    const shown = theme.palette?.[token];
    return seg(fit(shown ? toHex(shown) : "", HEX_WIDTH));
  },
};
const RATIO: Column = { heading: COLOR_EDITOR.columns.ratio, width: RATIO_WIDTH, cell: ratioCell };
const SAMPLE: Column = {
  heading: COLOR_EDITOR.columns.sample,
  width: 0,
  cell: ({ token }) =>
    token === "highlight"
      ? seg(COLOR_EDITOR.samples[token], SAMPLE_TONE[token], "highlight")
      : seg(COLOR_EDITOR.samples[token], SAMPLE_TONE[token]),
};
const ALL_COLUMNS: readonly Column[] = [ROLE, CHOSEN, SHOWN, RATIO, SAMPLE];
/** Every fixed column, after the gutter: narrower than this, the painted colour's goes. */
const FULL_WIDTH = GUTTER.length + ROLE_WIDTH + 2 * HEX_WIDTH + RATIO_WIDTH;

function columnsFor(width: number): readonly Column[] {
  return width >= FULL_WIDTH ? ALL_COLUMNS : ALL_COLUMNS.filter((column) => column !== SHOWN);
}

/** The column headings, then one row per role, each cut to `width`. */
export function colorTableLines(table: ColorTable, width: number): Line[] {
  const columns = columnsFor(width);
  const headings = columns.map((column) =>
    column.width === 0 ? column.heading : fit(column.heading, column.width),
  );
  const rows = CUSTOMIZABLE_TOKENS.map((token, index): Line => {
    const role = { token, theme: table.theme, chosen: table.customs[token] };
    const cells = clipLine(columns.map((column) => column.cell(role)), width - GUTTER.length);
    if (index !== table.cursor) return [seg(GUTTER), ...cells];
    return fillLine([seg("› ", "accent"), ...cells], width, "highlight");
  });
  return [clipLine([seg(`${GUTTER}${headings.join("")}`, "muted")], width), ...rows];
}

/** Grounds: "—" (or "ajusté ‼"); text roles: their worst ratio, or before → after. */
function ratioCell({ token, theme }: RoleCell): Segment {
  const correction = theme.report.corrections.find((candidate) => candidate.token === token);
  if (GROUNDS.has(token)) {
    return correction
      ? seg(fit(COLOR_EDITOR.groundCorrected, RATIO_WIDTH), "warning")
      : seg(fit(COLOR_EDITOR.ground, RATIO_WIDTH), "muted");
  }
  const { palette } = theme;
  if (!palette) return seg(fit(COLOR_EDITOR.ground, RATIO_WIDTH), "muted");
  const ratio = formatRatio(worstRatio(palette[token], [palette.background, palette.highlight]));
  const { success, warning } = STATUS_GLYPHS;
  if (!correction) {
    return seg(fit(`${ratio.padEnd(RATIO_TEXT_WIDTH)} ${success}`, RATIO_WIDTH), "success");
  }
  const moved = `${formatRatioValue(correction.before)} → ${ratio} ${warning}`;
  return seg(fit(moved, RATIO_WIDTH), "warning");
}

/** The warning under the table when some colours had to be adjusted. */
export function adjustedWarning(theme: ResolvedTheme, width: number): Line[] {
  const count = adjustedRoles(theme.report.corrections).length;
  if (count === 0) return [];
  const text = COLOR_EDITOR.corrected(count, theme.report.level);
  return [[], ...wrap(text, Math.max(1, width)).map((part): Line => [seg(part, "warning")])];
}
