import { localized } from "../../../core/i18n/localized.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import type { ContrastLevel, CustomizableToken } from "../../theme/palette.js";
import { counted } from "../format.js";

/**
 * The colour editor's words, in the interface's languages: its key hints,
 * its table, its warning and the dialog that takes a colour. The roles'
 * names and the contrast ratios are the theme engine's (`theme-labels.ts`).
 * Tests import these rather than repeat them.
 */

export const COLOR_EDITOR = localized({
  en: {
    title: "Colors",
    /** esc first after the basics: on a narrow bar, the end is what gets cut. */
    hints: "↑↓ role · enter #hex · esc back · ←→ hue · +/- lightness · a keep · del theme",
    base: (theme: string) => `Base theme: ${theme} — unchanged roles follow the theme.`,
    columns: {
      role: "Role",
      chosen: "Chosen",
      shown: "Shown",
      ratio: "Contrast",
      sample: "Sample",
    },
    themeValue: "(theme)",
    ground: "—",
    groundCorrected: `adjusted ${STATUS_GLYPHS.warning}`,
    corrected: (count: number, level: ContrastLevel) =>
      `${STATUS_GLYPHS.warning} ` +
      counted(
        count,
        "color adjusted automatically to stay readable",
        "colors adjusted automatically to stay readable",
      ) +
      ` (${level}). a: keep the adjusted value.`,
    samples: {
      accent: "› selection",
      success: `${STATUS_GLYPHS.success} up to date`,
      warning: "2.51.0",
      danger: `${STATUS_GLYPHS.failed} failed`,
      text: "Git.Git",
      muted: "note",
      background: "screen background",
      highlight: "› selected row",
    } satisfies Readonly<Record<CustomizableToken, string>>,
  },
  fr: {
    title: "Couleurs",
    hints:
      "↑↓ rôle · entrée #hex · échap retour · ←→ teinte · +/- luminosité · a garder · suppr thème",
    base: (theme) => `Thème de base : ${theme} — les rôles non modifiés suivent le thème.`,
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
    corrected: (count, level) =>
      `${STATUS_GLYPHS.warning} ` +
      counted(
        count,
        "couleur ajustée automatiquement pour rester lisible",
        "couleurs ajustées automatiquement pour rester lisibles",
      ) +
      ` (${level}). a : garder la valeur ajustée.`,
    samples: {
      accent: "› sélection",
      success: `${STATUS_GLYPHS.success} à jour`,
      warning: "2.51.0",
      danger: `${STATUS_GLYPHS.failed} échec`,
      text: "Git.Git",
      muted: "note",
      background: "fond de référence",
      highlight: "› ligne sélectionnée",
    },
  },
});

export const HEX_DIALOG = localized({
  en: {
    title: (role: string) => `Color — ${role}`,
    text: "Format #RRGGBB or #RGB. A color with too little contrast is adjusted automatically.",
    invalid: "expected format: #RRGGBB",
  },
  fr: {
    title: (role) => `Couleur — ${role}`,
    text: "Format #RRGGBB ou #RGB. Une couleur trop peu contrastée sera ajustée automatiquement.",
    invalid: "format attendu : #RRGGBB",
  },
});
