import type { ThemeSettings } from "../../settings/theme-section.js";
import {
  CONTRAST_LEVELS,
  CUSTOMIZABLE_TOKENS,
  type CustomizableToken,
} from "../../theme/palette.js";
import type { ResolvedTheme } from "../../theme/resolve-theme.js";
import {
  COLORS_VALUE,
  DENSITY_VALUES,
  GLYPH_VALUES,
  OPTION_HINTS,
  OPTION_LABELS,
  OPTIONS_SECTIONS,
} from "../../text/options-labels.js";
import {
  COLORS_UNAVAILABLE,
  contrastStatus,
  ROLE_LABELS,
  THEME_LABELS,
} from "../../text/theme-labels.js";
import { seg } from "../../tui/styled-lines.js";
import type { OptionRow, OptionsControls, OptionsHost, SectionFactory } from "./option-row.js";
import { choiceRow, choicesOf, interfaceRow } from "./option-rows.js";
import { ColorEditor } from "./views/color-editor.js";
import { ThemePicker } from "./views/theme-picker.js";

/**
 * APPARENCE: the theme (picked with a live preview of the whole app, its
 * contrast status as the hint), the custom colours of that theme, the
 * contrast level, the symbol set and the density.
 */
export const appearanceSection: SectionFactory = (controls, host) => {
  const rows = [
    themeRow(controls, host),
    colorsRow(controls, host),
    contrastRow(controls, host),
    interfaceRow({
      id: "glyphs",
      label: OPTION_LABELS.glyphs,
      choices: choicesOf(GLYPH_VALUES),
      hint: OPTION_HINTS.glyphs,
      read: (settings) => settings.glyphs,
      patch: (glyphs) => ({ glyphs }),
    })(controls, host),
    interfaceRow({
      id: "density",
      label: OPTION_LABELS.density,
      choices: choicesOf(DENSITY_VALUES),
      hint: OPTION_HINTS.density,
      read: (settings) => settings.density,
      patch: (density) => ({ density }),
    })(controls, host),
  ];
  return { id: "appearance", title: OPTIONS_SECTIONS.appearance, rows: () => rows };
};

function themeRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  const picker = (): ThemePicker => new ThemePicker({ controls, host });
  return {
    id: "theme",
    label: OPTION_LABELS.theme,
    value: () => THEME_LABELS[host.settings.get("theme").id],
    hint: () => {
      const status = contrastStatus(host.appearance.resolved());
      return [seg(status.text, status.tone)];
    },
    isEnabled: () => true,
    activate: () => controls.open(picker()),
  };
}

function colorsRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  const reason = (): string | null => colorsUnavailable(host.appearance.resolved());
  return {
    id: "colors",
    label: OPTION_LABELS.colors,
    value: () => COLORS_VALUE(customizedRoles(host.settings.get("theme")).length),
    hint: () => {
      const roles = customizedRoles(host.settings.get("theme")).map((token) => ROLE_LABELS[token]);
      return [seg(reason() ?? roles.join(", ").toLowerCase(), "muted")];
    },
    isEnabled: () => reason() === null,
    activate: () => controls.open(new ColorEditor({ controls, host })),
  };
}

function contrastRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  return choiceRow({
    id: "contrast",
    label: OPTION_LABELS.contrast,
    choices: CONTRAST_LEVELS.map((level) => ({ value: level, label: level })),
    hint: OPTION_HINTS.contrast,
    read: () => host.settings.get("theme").contrast,
    write: (contrast) => controls.save(() => host.settings.update("theme", { contrast })),
  });
}

/** The roles of the saved theme the user recoloured. */
function customizedRoles(theme: ThemeSettings): CustomizableToken[] {
  const customs = theme.custom[theme.id] ?? {};
  return CUSTOMIZABLE_TOKENS.filter((token) => customs[token] !== undefined);
}

/** Why the colours of the theme painted now cannot be tuned; null when they can. */
function colorsUnavailable(theme: ResolvedTheme): string | null {
  const { notices } = theme.report;
  if (notices.includes("no-color")) return COLORS_UNAVAILABLE.noColor;
  if (theme.mode === "monochrome") return COLORS_UNAVAILABLE.monochrome;
  if (notices.includes("depth-16")) return COLORS_UNAVAILABLE.depth16;
  if (theme.mode === "trusted") return COLORS_UNAVAILABLE.trusted;
  return null;
}
