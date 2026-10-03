import type { Tone } from "../tui/styled-lines.js";
import type { ColorToken, ContrastLevel } from "./palette.js";

/**
 * The single source of the colour pairs the TUI paints, and of the contrast
 * each must reach. The enforcement, the style tables and the contrast audit
 * all read these: a pair painted somewhere is a pair listed here.
 */

/** Minimum ratios: text (WCAG 1.4.3 / 1.4.6) and UI elements (1.4.11, which has no AAA). */
export const CONTRAST_TARGETS: Readonly<Record<ContrastLevel, { text: number; ui: number }>> = {
  AA: { text: 4.5, ui: 3 },
  AAA: { text: 7, ui: 3 },
};

/**
 * The token each tone is painted with on the background and the highlight.
 * Adding a Tone without a colour does not compile. On the accent fill every
 * tone paints as `onAccent` instead; off that fill, the `onAccent` tone
 * (meant for the title bar) reads as strong text, so no tone can ever land
 * on a ground it was not checked against.
 */
export const TONE_TOKEN: Readonly<Record<Tone, ColorToken>> = {
  plain: "text",
  strong: "strong",
  muted: "muted",
  disabled: "disabled",
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  onAccent: "strong",
};

/** Text tokens painted on the background and on the highlighted row. */
export const TEXT_TOKENS = [
  "text",
  "strong",
  "muted",
  "disabled",
  "accent",
  "success",
  "warning",
  "danger",
] as const satisfies readonly ColorToken[];

export interface ContrastRule {
  readonly token: ColorToken;
  readonly grounds: readonly ColorToken[];
  readonly kind: "text" | "ui";
}

/**
 * Every painted pair:
 * - text tokens on the background and the highlight (panels, sidebar,
 *   dialogs, status bar, the cursor row); panel titles use `text`;
 * - onAccent on the accent fill (title bar, active dialog button: every tone
 *   on that fill paints as onAccent);
 * - the accent fill against the background (where the bar meets the frame);
 * - borders against the background.
 */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  ...TEXT_TOKENS.map((token): ContrastRule => ({
    token,
    grounds: ["background", "highlight"],
    kind: "text",
  })),
  { token: "onAccent", grounds: ["accentFill"], kind: "text" },
  { token: "accentFill", grounds: ["background"], kind: "ui" },
  { token: "borderIdle", grounds: ["background"], kind: "ui" },
  { token: "borderFocus", grounds: ["background"], kind: "ui" },
];
