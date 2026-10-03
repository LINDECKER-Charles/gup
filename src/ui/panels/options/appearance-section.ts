import { CONTRAST_LEVELS } from "../../theme/palette.js";
import {
  DENSITY_VALUES,
  GLYPH_VALUES,
  OPTION_HINTS,
  OPTION_LABELS,
  OPTIONS_SECTIONS,
} from "../../text/options-labels.js";
import { contrastStatus, THEME_LABELS } from "../../text/theme-labels.js";
import { seg } from "../../tui/styled-lines.js";
import type { OptionRow, OptionsControls, OptionsHost, SectionFactory } from "./option-row.js";
import { choiceRow, choicesOf, interfaceRow } from "./option-rows.js";
import { ThemePicker } from "./views/theme-picker.js";

/**
 * APPARENCE: the theme (picked with a live preview of the whole app, its
 * contrast status as the hint), the contrast level, the symbol set and the
 * density.
 */
export const appearanceSection: SectionFactory = (controls, host) => {
  const rows = [
    themeRow(controls, host),
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
