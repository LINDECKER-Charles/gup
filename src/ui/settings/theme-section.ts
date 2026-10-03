import type { FieldReader, HexColor } from "../../core/config/field-reader.js";
import { defineSection } from "../../core/config/section.js";
import {
  CONTRAST_LEVELS,
  CUSTOMIZABLE_TOKENS,
  THEME_IDS,
  type ContrastLevel,
  type CustomizableToken,
  type ThemeId,
} from "../theme/palette.js";

/**
 * The `theme` section of the settings file: which theme, which WCAG level,
 * and the colours the user tuned. Customisations belong to their base
 * theme: an accent tuned for `dark` does not leak into `light`.
 */

export type CustomColors = Readonly<Partial<Record<CustomizableToken, HexColor>>>;

export interface ThemeSettings {
  readonly id: ThemeId;
  readonly contrast: ContrastLevel;
  readonly custom: Readonly<Partial<Record<ThemeId, CustomColors>>>;
}

const DEFAULTS: ThemeSettings = Object.freeze({ id: "terminal", contrast: "AA", custom: {} });

export const THEME_SECTION = defineSection<ThemeSettings>({
  key: "theme",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({
    id: read.oneOf("id", THEME_IDS, DEFAULTS.id),
    contrast: read.oneOf("contrast", CONTRAST_LEVELS, DEFAULTS.contrast),
    custom: readCustomColors(read.object("custom")),
  }),
});

function isThemeId(key: string): key is ThemeId {
  return (THEME_IDS as readonly string[]).includes(key);
}

/**
 * Per-theme colours. A theme id this build does not know (written by a newer
 * gup) is skipped; an invalid colour is dropped with an issue, the others of
 * the same theme are kept.
 */
function readCustomColors(read: FieldReader): ThemeSettings["custom"] {
  const entries = read
    .keys()
    .filter(isThemeId)
    .map((id): [ThemeId, CustomColors] => [id, readThemeColors(read.object(id))])
    .filter(([, colors]) => Object.keys(colors).length > 0);
  return Object.fromEntries(entries);
}

function readThemeColors(read: FieldReader): CustomColors {
  const entries = CUSTOMIZABLE_TOKENS.flatMap((token): Array<[CustomizableToken, HexColor]> => {
    const color = read.hexColor(token);
    return color ? [[token, color]] : [];
  });
  return Object.fromEntries(entries);
}
