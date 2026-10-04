/**
 * The non-ASCII symbols every default terminal font of Windows draws: the
 * characters found in the cmap of all of
 *
 * - Consolas 7.01 (`C:\Windows\Fonts\consola.ttf`), the console host's
 *   default font, which has no fallback: a missing symbol is a boxed `?`;
 * - Cascadia Mono and Cascadia Code 2102.025 (Windows 11's own copies);
 * - Cascadia Mono and Cascadia Code 2407.024 (bundled with Windows Terminal
 *   1.24, its default font).
 *
 * Letters, combining marks and spaces are left out: the guard tests only
 * look at symbols. macOS and Linux terminals fall back to another font for a
 * symbol theirs lacks, so this set is the binding one. Lucida Console 5.01,
 * an older console default, lacks the rounded and heavy box corners, ● and a
 * few shapes besides; it is not a target.
 *
 * Regenerate by intersecting the fonts' cmaps (fontkit's
 * `hasGlyphForCodePoint`) over these Unicode blocks, keeping `\p{P}`, `\p{S}`
 * and `\p{No}`.
 */
const BY_BLOCK = {
  latin1: "¡¢£¤¥¦§¨©«¬®¯°±²³´¶·¸¹»¼½¾¿×÷",
  punctuation: "‐–—―‗‘’‚‛“”„†‡•․…‰′″‹›‼‾⁄",
  superscriptsAndSubscripts: "⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉",
  currency: "₠₡₣₤₦₧₨₩₪₫€₭₮₱₲₴₵₸₹₺₼₽₾",
  letterlike: "℅№℗™℮",
  numberForms: "⅛⅜⅝⅞",
  arrows: "←↑→↓↔↕↨",
  mathematical: "∂∆∏∑−∕∙√∞∟∩∫≈≠≡≤≥",
  technical: "⌂⌐⌠⌡",
  boxDrawing:
    "─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿" +
    "╀╁╂╃╄╅╆╇╈╉╊╋╌╍╎╏═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬╭╮╯╰╱╲╳╴╵╶╷╸╹╺╻╼╽╾╿",
  blocks: "▀▄█▌▐░▒▓",
  geometric: "■□▪▫▬▲▴▸►▼▾◂◄◊○◌●◘◙◦",
  miscellaneous: "☺☻☼♀♂♠♣♥♦♪♫",
} as const;

export const SAFE_TERMINAL_GLYPHS: ReadonlySet<string> = new Set(
  Object.values(BY_BLOCK).flatMap((symbols) => [...symbols]),
);
