import { adjustedRoles } from "../../theme/enforce-contrast.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import type { PaintMode, ResolvedTheme } from "../../theme/resolve-theme.js";
import type { ContrastLevel, CustomizableToken, ThemeId } from "../../theme/palette.js";
import type { Tone } from "../../tui/styled-lines.js";
import { counted, formatDecimal } from "../fr-format.js";

/**
 * The theme engine's words (French, the language of the interface): theme
 * names and descriptions, colour roles, contrast ratios and statuses, the
 * theme picker and the colour editor. Tests import these rather than repeat
 * them.
 */

export const THEME_LABELS: Readonly<Record<ThemeId, string>> = {
  terminal: "Terminal",
  auto: "Auto (clair/sombre)",
  dark: "Sombre (gup)",
  light: "Clair (gup)",
  "high-contrast": "Contraste élevé",
  colorblind: "Daltonisme (Okabe-Ito)",
  dracula: "Dracula",
  "catppuccin-mocha": "Catppuccin Mocha",
  "github-light": "GitHub (clair)",
  monochrome: "Monochrome",
};

export const THEME_DESCRIPTIONS: Readonly<Record<ThemeId, string>> = {
  terminal: "suit la palette de votre terminal",
  auto: "Sombre ou Clair selon le fond du terminal",
  dark: "palette de la marque gup",
  light: "pour les terminaux à fond clair",
  "high-contrast": "7:1 minimum (AAA)",
  colorblind: "succès bleu, erreur orange : jamais rouge contre vert",
  dracula: "variante ajustée pour l'AA",
  "catppuccin-mocha": "tons pastel sur fond sombre",
  "github-light": "variante ajustée pour l'AA",
  monochrome: "sans couleur, sélection en vidéo inverse",
};

/** The colour roles a user can tune, as the colour editor names them. */
export const ROLE_LABELS: Readonly<Record<CustomizableToken, string>> = {
  accent: "Accent",
  success: "Succès",
  warning: "Attention",
  danger: "Erreur",
  text: "Texte",
  muted: "Texte secondaire",
  background: "Fond",
  highlight: "Surbrillance",
};

/** Why a theme cannot be painted on this terminal. */
export const THEME_UNAVAILABLE_16 = "indisponible : terminal 16 couleurs";

/**
 * `6.14` → "6,1": one decimal, truncated — a shown "4,5" is never a
 * rounded-up 4.46, so a passing ratio never reads higher than it is.
 */
export function formatRatioValue(ratio: number): string {
  return formatDecimal(Math.floor(ratio * 10) / 10, 1);
}

/** "1 couleur ajustée", "2 couleurs ajustées". */
function adjustedColors(count: number): string {
  return counted(count, "couleur ajustée", "couleurs ajustées");
}

/** "1 couleur ajustée <how>pour rester lisible", "2 couleurs ajustées <how>pour rester lisibles". */
function adjustedToStayReadable(count: number, how = ""): string {
  return counted(
    count,
    `couleur ajustée ${how}pour rester lisible`,
    `couleurs ajustées ${how}pour rester lisibles`,
  );
}

/** `6.14` → "6,1:1". */
export function formatRatio(ratio: number): string {
  return `${formatRatioValue(ratio)}:1`;
}

export const CONTRAST_STATUS = {
  pass: (level: ContrastLevel, ratio: number) =>
    `${STATUS_GLYPHS.success} ${level} · contraste min. ${formatRatio(ratio)}`,
  corrected: (count: number, ratio: number) =>
    `${STATUS_GLYPHS.warning} ${adjustedColors(count)} · min. ${formatRatio(ratio)}`,
  approximated: (ratio: number) =>
    `couleurs approchées (terminal 256 couleurs) · min. ${formatRatio(ratio)}`,
  unverified: "? palette du terminal inconnue — contraste non vérifiable",
  pending: "… détection de la palette du terminal",
  noColor: "NO_COLOR actif — monochrome imposé",
  monochrome: "sans couleur — contraste de votre terminal",
  depth16: "terminal 16 couleurs — couleurs de votre terminal",
} as const;

export interface StatusLabel {
  readonly text: string;
  readonly tone: Tone;
}

/** How readable the theme painted now is, in one line: the hint of the "Thème" row. */
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

export const THEME_PICKER = {
  title: "Thème",
  listHeading: "Thèmes",
  previewHeading: "Aperçu",
  hints: "↑↓ essayer · entrée appliquer · échap annuler",
  report: (ratio: number, level: ContrastLevel) =>
    `Contraste minimal ${formatRatio(ratio)} — ${level} ${STATUS_GLYPHS.success}`,
  corrections: (count: number) => adjustedToStayReadable(count),
  modeNotes: {
    rgb: "Fond peint par gup (la transparence du terminal n'est pas conservée).",
    detected: "Suit la palette de votre terminal.",
    trusted:
      "Couleurs de votre terminal, telles quelles. Choisissez un thème RVB pour une lisibilité " +
      "garantie.",
    monochrome: "Couleur et fond de votre terminal ; sélection en vidéo inverse.",
  } satisfies Readonly<Record<PaintMode, string>>,
} as const;

/** The words of the sample block the picker paints with the theme under the cursor. */
export const THEME_SAMPLE = {
  view: "Paquets",
  packages: [
    { name: "Git.Git", current: "2.51.0", latest: "2.52.0" },
    { name: "7zip.7zip", current: "25.00", latest: "25.01" },
  ],
  success: `${STATUS_GLYPHS.success} succès`,
  warning: `${STATUS_GLYPHS.warning} attention`,
  danger: `${STATUS_GLYPHS.failed} erreur`,
  muted: "texte secondaire",
  disabled: "– indisponible",
  title: "gup · barre de titre",
  yes: "Oui",
  no: "Non",
} as const;

export const COLOR_EDITOR = {
  title: "Couleurs",
  /** échap first after the basics: on a narrow bar, the end is what gets cut. */
  hints:
    "↑↓ rôle · entrée #hex · échap retour · ←→ teinte · +/- luminosité · a garder · suppr thème",
  base: (theme: string) => `Thème de base : ${theme} — les rôles non modifiés suivent le thème.`,
  columns: {
    role: "Rôle",
    chosen: "Choisie",
    shown: "Affichée",
    ratio: "Contraste",
    sample: "Aperçu",
  },
  themeValue: "(thème)",
  ground: "—",
  groundCorrected: `ajusté ${STATUS_GLYPHS.warning}`,
  corrected: (count: number, level: ContrastLevel) =>
    `${STATUS_GLYPHS.warning} ${adjustedToStayReadable(count, "automatiquement ")} (${level}). ` +
    "a : garder la valeur ajustée.",
  samples: {
    accent: "› sélection",
    success: `${STATUS_GLYPHS.success} à jour`,
    warning: "2.51.0",
    danger: `${STATUS_GLYPHS.failed} échec`,
    text: "Git.Git",
    muted: "note",
    background: "fond de référence",
    highlight: "› ligne sélectionnée",
  } satisfies Readonly<Record<CustomizableToken, string>>,
} as const;

export const HEX_DIALOG = {
  title: (role: string) => `Couleur — ${role}`,
  text: "Format #RRGGBB ou #RGB. Une couleur trop peu contrastée sera ajustée automatiquement.",
  invalid: "format attendu : #RRGGBB",
} as const;

/** Why the colour editor cannot open with the theme painted now. */
export const COLORS_UNAVAILABLE = {
  noColor: "NO_COLOR actif",
  monochrome: "sans objet en monochrome",
  depth16: THEME_UNAVAILABLE_16,
  trusted: "indisponible — palette du terminal inconnue",
} as const;

/** Shown in the title bar while a theme is previewed but not saved. */
export const PREVIEW_FACT = "aperçu du thème";
