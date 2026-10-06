import { localized, type Translations } from "../../../core/i18n/localized.js";
import { adjustedRoles } from "../../theme/enforce-contrast.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import type { PaintMode, ResolvedTheme } from "../../theme/resolve-theme.js";
import type { ContrastLevel, CustomizableToken, ThemeId } from "../../theme/palette.js";
import type { Tone } from "../../tui/styled-lines.js";
import { counted, formatDecimal } from "../format.js";

/**
 * The theme engine's words, in the interface's languages: theme names and
 * descriptions, colour roles, contrast ratios and statuses, the theme picker
 * and why colours cannot be tuned. Theme ids never change; only their names
 * do. The colour editor's own words live in `color-editor-labels.ts`. Tests
 * import these rather than repeat them.
 */

export const THEME_LABELS = localized<Readonly<Record<ThemeId, string>>>({
  en: {
    terminal: "Terminal",
    auto: "Auto (light/dark)",
    dark: "Dark (gup)",
    light: "Light (gup)",
    "high-contrast": "High contrast",
    colorblind: "Colorblind (Okabe-Ito)",
    "ayu-dark": "Ayu Dark",
    "catppuccin-mocha": "Catppuccin Mocha",
    cobalt2: "Cobalt2",
    dracula: "Dracula",
    everforest: "Everforest",
    "gruvbox-dark": "Gruvbox (dark)",
    kanagawa: "Kanagawa",
    monokai: "Monokai",
    nord: "Nord",
    "one-dark": "One Dark",
    "rose-pine": "Rosé Pine",
    "solarized-dark": "Solarized (dark)",
    "synthwave-84": "SynthWave '84",
    "catppuccin-latte": "Catppuccin Latte",
    "flexoki-light": "Flexoki (light)",
    "github-light": "GitHub (light)",
    "gruvbox-light": "Gruvbox (light)",
    "papercolor-light": "PaperColor (light)",
    "rose-pine-dawn": "Rosé Pine Dawn",
    "solarized-light": "Solarized (light)",
    monochrome: "Monochrome",
  },
  fr: {
    terminal: "Terminal",
    auto: "Auto (clair/sombre)",
    dark: "Sombre (gup)",
    light: "Clair (gup)",
    "high-contrast": "Contraste élevé",
    colorblind: "Daltonisme (Okabe-Ito)",
    "ayu-dark": "Ayu Dark",
    "catppuccin-mocha": "Catppuccin Mocha",
    cobalt2: "Cobalt2",
    dracula: "Dracula",
    everforest: "Everforest",
    "gruvbox-dark": "Gruvbox (sombre)",
    kanagawa: "Kanagawa",
    monokai: "Monokai",
    nord: "Nord",
    "one-dark": "One Dark",
    "rose-pine": "Rosé Pine",
    "solarized-dark": "Solarized (sombre)",
    "synthwave-84": "SynthWave '84",
    "catppuccin-latte": "Catppuccin Latte",
    "flexoki-light": "Flexoki (clair)",
    "github-light": "GitHub (clair)",
    "gruvbox-light": "Gruvbox (clair)",
    "papercolor-light": "PaperColor (clair)",
    "rose-pine-dawn": "Rosé Pine Dawn",
    "solarized-light": "Solarized (clair)",
    monochrome: "Monochrome",
  },
});

export const THEME_DESCRIPTIONS = localized<Readonly<Record<ThemeId, string>>>({
  en: {
    terminal: "follows your terminal's palette",
    auto: "Dark or Light, from the terminal's background",
    dark: "gup's brand palette",
    light: "for terminals with a light background",
    "high-contrast": "7:1 minimum (AAA)",
    colorblind: "blue success, orange error: never red against green",
    "ayu-dark": "golden accent on near black",
    "catppuccin-mocha": "pastel tones on a dark background",
    cobalt2: "golden yellow on cobalt blue",
    dracula: "variant tuned for AA",
    everforest: "soft greens, easy on the eyes",
    "gruvbox-dark": "warm retro tones, orange accent",
    kanagawa: "Hokusai's ink, parchment and wave blue",
    monokai: "Sublime Text's classic: vivid colors on olive black",
    nord: "an arctic, north-bluish palette",
    "one-dark": "Atom's dark theme",
    "rose-pine": "muted rose, gold and iris",
    "solarized-dark": "Solarized's dark teal ground, tuned for AA",
    "synthwave-84": "neon pink and cyan on purple",
    "catppuccin-latte": "Catppuccin's light flavor",
    "flexoki-light": "inky colors on warm paper",
    "github-light": "variant tuned for AA",
    "gruvbox-light": "warm retro tones on cream",
    "papercolor-light": "light paper tones, deep blue accent",
    "rose-pine-dawn": "Rosé Pine on cream",
    "solarized-light": "Solarized's cream ground, tuned for AA",
    monochrome: "no color, selection in reverse video",
  },
  fr: {
    terminal: "suit la palette de votre terminal",
    auto: "Sombre ou Clair selon le fond du terminal",
    dark: "palette de la marque gup",
    light: "pour les terminaux à fond clair",
    "high-contrast": "7:1 minimum (AAA)",
    colorblind: "succès bleu, erreur orange : jamais rouge contre vert",
    "ayu-dark": "accent doré sur fond presque noir",
    "catppuccin-mocha": "tons pastel sur fond sombre",
    cobalt2: "jaune d'or sur bleu cobalt",
    dracula: "variante ajustée pour l'AA",
    everforest: "verts doux, reposants pour les yeux",
    "gruvbox-dark": "tons chauds rétro, accent orange",
    kanagawa: "l'encre, le parchemin et le bleu de la vague d'Hokusai",
    monokai: "le classique de Sublime Text : couleurs vives sur noir olive",
    nord: "une palette arctique aux tons bleutés",
    "one-dark": "le thème sombre d'Atom",
    "rose-pine": "rose, or et iris en sourdine",
    "solarized-dark": "le fond bleu canard de Solarized, ajusté pour l'AA",
    "synthwave-84": "rose et cyan néon sur violet",
    "catppuccin-latte": "la variante claire de Catppuccin",
    "flexoki-light": "couleurs d'encre sur papier chaud",
    "github-light": "variante ajustée pour l'AA",
    "gruvbox-light": "tons chauds rétro sur fond crème",
    "papercolor-light": "tons de papier clair, accent bleu profond",
    "rose-pine-dawn": "Rosé Pine sur fond crème",
    "solarized-light": "le fond crème de Solarized, ajusté pour l'AA",
    monochrome: "sans couleur, sélection en vidéo inverse",
  },
});

/** The colour roles a user can tune, as the colour editor names them. */
export const ROLE_LABELS = localized<Readonly<Record<CustomizableToken, string>>>({
  en: {
    accent: "Accent",
    success: "Success",
    warning: "Warning",
    danger: "Error",
    text: "Text",
    muted: "Secondary text",
    background: "Background",
    highlight: "Highlight",
  },
  fr: {
    accent: "Accent",
    success: "Succès",
    warning: "Attention",
    danger: "Erreur",
    text: "Texte",
    muted: "Texte secondaire",
    background: "Fond",
    highlight: "Surbrillance",
  },
});

/** Why a theme cannot be painted on this terminal, and its colours not tuned there. */
const UNAVAILABLE_16: Translations<string> = {
  en: "unavailable: 16-color terminal",
  fr: "indisponible : terminal 16 couleurs",
};

/**
 * `6.14` → "6.1" in English, "6,1" in French: one decimal, truncated — a
 * shown "4.5" is never a rounded-up 4.46, so a passing ratio never reads
 * higher than it is.
 */
export function formatRatioValue(ratio: number): string {
  return formatDecimal(Math.floor(ratio * 10) / 10, 1);
}

/** `6.14` → "6.1:1" in English, "6,1:1" in French. */
export function formatRatio(ratio: number): string {
  return `${formatRatioValue(ratio)}:1`;
}

export const CONTRAST_STATUS = localized({
  en: {
    pass: (level: ContrastLevel, ratio: number) =>
      `${STATUS_GLYPHS.success} ${level} · min. contrast ${formatRatio(ratio)}`,
    corrected: (count: number, ratio: number) =>
      `${STATUS_GLYPHS.warning} ${counted(count, "color adjusted", "colors adjusted")} · ` +
      `min. ${formatRatio(ratio)}`,
    approximated: (ratio: number) =>
      `approximate colors (256-color terminal) · min. ${formatRatio(ratio)}`,
    unverified: "? terminal palette unknown — contrast cannot be checked",
    pending: "… detecting the terminal palette",
    noColor: "NO_COLOR set — monochrome forced",
    monochrome: "no color — your terminal's contrast",
    depth16: "16-color terminal — your terminal's colors",
  },
  fr: {
    pass: (level, ratio) =>
      `${STATUS_GLYPHS.success} ${level} · contraste min. ${formatRatio(ratio)}`,
    corrected: (count, ratio) =>
      `${STATUS_GLYPHS.warning} ${counted(count, "couleur ajustée", "couleurs ajustées")} · ` +
      `min. ${formatRatio(ratio)}`,
    approximated: (ratio) =>
      `couleurs approchées (terminal 256 couleurs) · min. ${formatRatio(ratio)}`,
    unverified: "? palette du terminal inconnue — contraste non vérifiable",
    pending: "… détection de la palette du terminal",
    noColor: "NO_COLOR actif — monochrome imposé",
    monochrome: "sans couleur — contraste de votre terminal",
    depth16: "terminal 16 couleurs — couleurs de votre terminal",
  },
});

export interface StatusLabel {
  readonly text: string;
  readonly tone: Tone;
}

/** How readable the theme painted now is, in one line: the hint of the theme row. */
export function contrastStatus(theme: ResolvedTheme): StatusLabel {
  const { notices, minTextRatio, corrections, level } = theme.report;
  if (notices.includes("no-color")) return { text: CONTRAST_STATUS.noColor, tone: "warning" };
  if (theme.mode === "monochrome") return { text: CONTRAST_STATUS.monochrome, tone: "muted" };
  if (notices.includes("depth-16")) return { text: CONTRAST_STATUS.depth16, tone: "warning" };
  if (notices.includes("palette-pending")) return { text: CONTRAST_STATUS.pending, tone: "muted" };
  if (minTextRatio === null) return { text: CONTRAST_STATUS.unverified, tone: "warning" };
  if (notices.includes("depth-256")) {
    return { text: CONTRAST_STATUS.approximated(minTextRatio), tone: "warning" };
  }
  const adjusted = adjustedRoles(corrections).length;
  if (adjusted > 0) {
    return { text: CONTRAST_STATUS.corrected(adjusted, minTextRatio), tone: "warning" };
  }
  return { text: CONTRAST_STATUS.pass(level, minTextRatio), tone: "success" };
}

export const THEME_PICKER = localized({
  en: {
    title: "Theme",
    listHeading: "Themes",
    previewHeading: "Preview",
    hints: "↑↓ try · enter apply · esc cancel",
    report: (ratio: number, level: ContrastLevel) =>
      `Minimum contrast ${formatRatio(ratio)} — ${level} ${STATUS_GLYPHS.success}`,
    corrections: (count: number) =>
      counted(count, "color adjusted to stay readable", "colors adjusted to stay readable"),
    /** Why the theme under the cursor cannot be painted on this terminal. */
    unavailable: UNAVAILABLE_16.en,
    modeNotes: {
      rgb: "Background painted by gup (the terminal's transparency is not kept).",
      detected: "Follows your terminal's palette.",
      trusted:
        "Your terminal's colors, as they are. Pick an RGB theme for guaranteed " +
        "readability.",
      monochrome: "Your terminal's color and background; selection in reverse video.",
    } satisfies Readonly<Record<PaintMode, string>>,
    /** Shown in the title bar while a theme is previewed but not saved. */
    previewFact: "theme preview",
  },
  fr: {
    title: "Thème",
    listHeading: "Thèmes",
    previewHeading: "Aperçu",
    hints: "↑↓ essayer · entrée appliquer · échap annuler",
    report: (ratio, level) =>
      `Contraste minimal ${formatRatio(ratio)} — ${level} ${STATUS_GLYPHS.success}`,
    corrections: (count) =>
      counted(
        count,
        "couleur ajustée pour rester lisible",
        "couleurs ajustées pour rester lisibles",
      ),
    unavailable: UNAVAILABLE_16.fr,
    modeNotes: {
      rgb: "Fond peint par gup (la transparence du terminal n'est pas conservée).",
      detected: "Suit la palette de votre terminal.",
      trusted:
        "Couleurs de votre terminal, telles quelles. Choisissez un thème RVB pour une lisibilité " +
        "garantie.",
      monochrome: "Couleur et fond de votre terminal ; sélection en vidéo inverse.",
    },
    previewFact: "aperçu du thème",
  },
});

interface SamplePackage {
  readonly name: string;
  readonly current: string;
  readonly latest: string;
}

/** Sample data, the same in every language. */
const SAMPLE_PACKAGES: readonly SamplePackage[] = [
  { name: "Git.Git", current: "2.51.0", latest: "2.52.0" },
  { name: "7zip.7zip", current: "25.00", latest: "25.01" },
];

/** The words of the sample block the picker paints with the theme under the cursor. */
export const THEME_SAMPLE = localized({
  en: {
    view: "Packages",
    packages: SAMPLE_PACKAGES,
    success: `${STATUS_GLYPHS.success} success`,
    warning: `${STATUS_GLYPHS.warning} warning`,
    danger: `${STATUS_GLYPHS.failed} error`,
    muted: "secondary text",
    disabled: "– unavailable",
    title: "gup · title bar",
    yes: "Yes",
    no: "No",
  },
  fr: {
    view: "Paquets",
    packages: SAMPLE_PACKAGES,
    success: `${STATUS_GLYPHS.success} succès`,
    warning: `${STATUS_GLYPHS.warning} attention`,
    danger: `${STATUS_GLYPHS.failed} erreur`,
    muted: "texte secondaire",
    disabled: "– indisponible",
    title: "gup · barre de titre",
    yes: "Oui",
    no: "Non",
  },
});

/** Why the colour editor cannot open with the theme painted now. */
export const COLORS_UNAVAILABLE = localized({
  en: {
    noColor: "NO_COLOR set",
    monochrome: "not used in monochrome",
    depth16: UNAVAILABLE_16.en,
    trusted: "unavailable — terminal palette unknown",
  },
  fr: {
    noColor: "NO_COLOR actif",
    monochrome: "sans objet en monochrome",
    depth16: UNAVAILABLE_16.fr,
    trusted: "indisponible — palette du terminal inconnue",
  },
});
