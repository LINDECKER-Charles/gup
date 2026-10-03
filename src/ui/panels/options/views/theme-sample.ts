import { THEME_SAMPLE } from "../../../text/theme-labels.js";
import { fillLine, fit, seg, type Line } from "../../../tui/styled-lines.js";

const NAME_WIDTH = 11;

/**
 * A miniature of the app painted with every tone and fill the screens use —
 * a view title, the cursor row on the highlight, a checked and an unchecked
 * package, the status colours, secondary and disabled text, the title bar,
 * an active and an inactive button — so the theme under the picker's cursor
 * can be judged on all of it. Every line fits in 32 columns; the cursor row
 * is filled to `width`.
 */
export function themeSample(width: number): Line[] {
  const [first, second] = THEME_SAMPLE.packages;
  return [
    [seg("▌ ", "accent"), seg(THEME_SAMPLE.view, "strong")],
    fillLine(
      [seg("› ", "accent"), seg("[■] ", "success"), ...packageCells(first)],
      width,
      "highlight",
    ),
    [seg("  "), seg("[ ] ", "muted"), ...packageCells(second)],
    [
      seg("  "),
      seg(THEME_SAMPLE.success, "success"),
      seg(" "),
      seg(THEME_SAMPLE.warning, "warning"),
      seg(" "),
      seg(THEME_SAMPLE.danger, "danger"),
    ],
    [seg("  "), seg(THEME_SAMPLE.muted, "muted")],
    [seg("  "), seg(THEME_SAMPLE.disabled, "disabled")],
    [seg("  "), seg(` ${THEME_SAMPLE.title} `, "onAccent", "accent")],
    [
      seg("  "),
      seg(` ${THEME_SAMPLE.yes} `, "onAccent", "accent"),
      seg("  "),
      seg(` ${THEME_SAMPLE.no} `, "muted"),
    ],
  ];
}

function packageCells(
  pkg: { readonly name: string; readonly current: string; readonly latest: string } | undefined,
): Line {
  if (!pkg) return [];
  return [
    seg(fit(pkg.name, NAME_WIDTH)),
    seg(pkg.current, "muted"),
    seg(" → ", "muted"),
    seg(pkg.latest, "warning"),
  ];
}
