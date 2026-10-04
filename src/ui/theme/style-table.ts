import type { Fill, Tone } from "../tui/styled-lines.js";
import type { Rgb } from "./color/rgb.js";
import { TONE_TOKEN } from "./contrast-rules.js";
import type { ColorToken, Palette } from "./palette.js";
import type { ResolvedTheme } from "./resolve-theme.js";
import { ANSI_SLOTS, type PaintSource } from "./terminal-palette.js";

/**
 * A resolved theme as paint: for every tone on every fill, the colours and
 * attributes of the chunk; borders, titles, background and the text field.
 * Pure data — the appearance turns it into OpenTUI colours.
 *
 * - rgb / detected: the palette, no DIM (the colours carry the hierarchy);
 *   on the accent fill every tone is the fill's own text colour.
 * - trusted (terminal palette unknown): the terminal's own foreground, and
 *   for each coloured tone the ANSI slot (or the foreground) the resolve
 *   chose as most likely to read there; fills are inverse video, so a
 *   selected row keeps exactly the terminal's text contrast whatever its theme.
 * - monochrome: the terminal's foreground only, fills in inverse video.
 */

export type FillKey = "none" | Fill;

/** A colour as the terminal receives it. `rgb`, when known, is what it looks like. */
export type ColorRef =
  | { readonly kind: "rgb"; readonly rgb: Rgb }
  | { readonly kind: "slot"; readonly slot: number; readonly rgb?: Rgb }
  | { readonly kind: "terminal-fg"; readonly rgb?: Rgb }
  | { readonly kind: "terminal-bg"; readonly rgb?: Rgb };

export interface TextStyle {
  readonly fg: ColorRef;
  /** Absent: the ground under the chunk shows through. */
  readonly bg?: ColorRef;
  readonly isBold: boolean;
  readonly isDim: boolean;
  readonly isInverse: boolean;
}

export interface ThemePaint {
  readonly text: Readonly<Record<Tone, Readonly<Record<FillKey, TextStyle>>>>;
  readonly border: { readonly idle: ColorRef; readonly focus: ColorRef };
  readonly title: ColorRef;
  /** null: leave the terminal's own background (no fill). */
  readonly background: ColorRef | null;
  readonly input: {
    readonly text: ColorRef;
    readonly background: ColorRef | null;
    readonly placeholder: ColorRef;
    readonly cursor: ColorRef;
    readonly isInverse: boolean;
  };
}

type Role = "fg" | "bg";

const TONES = Object.keys(TONE_TOKEN) as Tone[];
const FILL_KEYS: readonly FillKey[] = ["none", "highlight", "accent"];
const BOLD_TONES: ReadonlySet<Tone> = new Set(["strong", "onAccent"]);
const DIM_TONES: ReadonlySet<Tone> = new Set(["muted", "disabled"]);
const TERMINAL_FG: ColorRef = { kind: "terminal-fg" };
/**
 * The roles trusted mode colours, with the slot each takes on a reported
 * palette — the default when the resolve chose none. Other tones: the
 * terminal's foreground.
 */
const TRUSTED_SLOTS: Readonly<Partial<Record<ColorToken, number>>> = {
  accent: ANSI_SLOTS.accent,
  success: ANSI_SLOTS.success,
  warning: ANSI_SLOTS.warning,
  danger: ANSI_SLOTS.danger,
  borderIdle: ANSI_SLOTS.border,
  borderFocus: ANSI_SLOTS.accent,
};

export function buildThemePaint(theme: ResolvedTheme): ThemePaint {
  if (theme.palette === null) {
    return theme.mode === "trusted" ? trustedPaint(theme.sources) : monochromePaint();
  }
  return palettePaint(theme.palette, theme.sources);
}

function style(fg: ColorRef, flags: Partial<Omit<TextStyle, "fg">> = {}): TextStyle {
  return { isBold: false, isDim: false, isInverse: false, fg, ...flags };
}

function tableOf(paint: (tone: Tone, fill: FillKey) => TextStyle): ThemePaint["text"] {
  const rowOf = (tone: Tone): Record<FillKey, TextStyle> =>
    Object.fromEntries(FILL_KEYS.map((fill) => [fill, paint(tone, fill)])) as Record<
      FillKey,
      TextStyle
    >;
  return Object.fromEntries(TONES.map((tone) => [tone, rowOf(tone)])) as ThemePaint["text"];
}

function palettePaint(
  palette: Palette,
  sources: Readonly<Partial<Record<ColorToken, PaintSource>>>,
): ThemePaint {
  const ref = (token: ColorToken, role: Role = "fg"): ColorRef =>
    refOf({ rgb: palette[token], source: sources[token], role });
  const text = tableOf((tone, fill) => {
    const isBold = BOLD_TONES.has(tone);
    if (fill === "accent") return style(ref("onAccent"), { bg: ref("accentFill", "bg"), isBold });
    const fg = ref(TONE_TOKEN[tone]);
    return style(fg, { isBold, ...(fill === "highlight" && { bg: ref("highlight", "bg") }) });
  });
  const background = sources.background?.kind === "terminal-bg" ? null : ref("background", "bg");
  return {
    text,
    border: { idle: ref("borderIdle"), focus: ref("borderFocus") },
    title: ref("text"),
    background,
    input: {
      text: ref("text"),
      background: ref("highlight", "bg"),
      placeholder: ref("muted"),
      cursor: ref("accent"),
      isInverse: false,
    },
  };
}

/**
 * A token's colour as the terminal gets it. The terminal's "default" colour
 * means its foreground for text and its background behind it, so a default
 * source only stands for itself in its own role; elsewhere it is painted as
 * the RGB it was detected with.
 */
function refOf(token: { rgb: Rgb; source: PaintSource | undefined; role: Role }): ColorRef {
  const { rgb, source, role } = token;
  if (source?.kind === "slot") return { kind: "slot", slot: source.slot, rgb };
  const ownRole = source?.kind === "terminal-fg" ? "fg" : "bg";
  if (source && ownRole === role) return { kind: source.kind, rgb };
  return { kind: "rgb", rgb };
}

function trustedPaint(sources: Readonly<Partial<Record<ColorToken, PaintSource>>>): ThemePaint {
  const colorOf = (token: ColorToken, slot: number): ColorRef => {
    const source = sources[token];
    if (source?.kind === "terminal-fg") return TERMINAL_FG;
    return { kind: "slot", slot: source?.kind === "slot" ? source.slot : slot };
  };
  const text = tableOf((tone, fill) => {
    const isBold = BOLD_TONES.has(tone);
    if (fill !== "none") return style(TERMINAL_FG, { isBold, isInverse: true });
    const slot = TRUSTED_SLOTS[TONE_TOKEN[tone]];
    if (slot !== undefined) return style(colorOf(TONE_TOKEN[tone], slot));
    return style(TERMINAL_FG, { isBold, isDim: DIM_TONES.has(tone) });
  });
  return {
    text,
    border: {
      idle: colorOf("borderIdle", ANSI_SLOTS.border),
      focus: colorOf("borderFocus", ANSI_SLOTS.accent),
    },
    ...terminalChrome(),
  };
}

function monochromePaint(): ThemePaint {
  const text = tableOf((tone, fill) =>
    style(TERMINAL_FG, {
      isBold: BOLD_TONES.has(tone) || fill === "accent",
      isInverse: fill !== "none",
    }),
  );
  return { text, border: { idle: TERMINAL_FG, focus: TERMINAL_FG }, ...terminalChrome() };
}

/** Title, background and text field when gup paints no colour of its own. */
function terminalChrome(): Pick<ThemePaint, "title" | "background" | "input"> {
  return {
    title: TERMINAL_FG,
    background: null,
    input: {
      text: TERMINAL_FG,
      background: null,
      placeholder: TERMINAL_FG,
      cursor: TERMINAL_FG,
      isInverse: true,
    },
  };
}
