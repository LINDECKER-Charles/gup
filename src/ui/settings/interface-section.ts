import { defineSection } from "../../core/config/section.js";
import {
  DEFAULT_UI_PREFERENCES,
  type NoteColumn,
  type PackageSort,
  type UiPreferences,
} from "../app/ui-preferences.js";
import type { ViewId } from "../app/view-definition.js";
import type { Density } from "../theme/appearance.js";
import type { GlyphPreference } from "../theme/glyphs.js";

/**
 * The `interface` section: how the full-screen app looks and behaves. Its
 * menu fields are the menu's own preferences ({@link UiPreferences}, minus
 * the scan settings, which live in the `scan` section); the rest — density,
 * symbols, mouse — belong to the screens.
 */

type MenuSettings = Omit<UiPreferences, "scan">;

export interface InterfaceSettings extends MenuSettings {
  readonly density: Density;
  readonly glyphs: GlyphPreference;
  readonly mouse: boolean;
}

// Every value of each enumeration, as a record so a new member is a compile
// error here until it is listed.
const VIEW_IDS = keysOf<ViewId>({
  scan: true,
  packages: true,
  schedules: true,
  providers: true,
  journal: true,
  options: true,
});
const PACKAGE_SORTS = keysOf<PackageSort>({ provider: true, name: true, bump: true });
const NOTE_COLUMNS = keysOf<NoteColumn>({ auto: true, hidden: true });
const DENSITIES = keysOf<Density>({ comfortable: true, compact: true });
const GLYPH_PREFERENCES = keysOf<GlyphPreference>({ auto: true, unicode: true, ascii: true });

function keysOf<T extends string>(members: Readonly<Record<T, true>>): readonly T[] {
  return Object.freeze(Object.keys(members) as T[]);
}

/** The menu's defaults are the menu's own; the screens' defaults are gup's look out of the box. */
const { scan: _scan, ...MENU_DEFAULTS } = DEFAULT_UI_PREFERENCES;
const DEFAULTS: InterfaceSettings = Object.freeze({
  ...MENU_DEFAULTS,
  density: "comfortable",
  glyphs: "auto",
  mouse: true,
});

export const INTERFACE_SECTION = defineSection<InterfaceSettings>({
  key: "interface",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({
    launchView: read.oneOf("launchView", VIEW_IDS, DEFAULTS.launchView),
    scanOnLaunch: read.boolean("scanOnLaunch", DEFAULTS.scanOnLaunch),
    confirmBeforeUpdate: read.boolean("confirmBeforeUpdate", DEFAULTS.confirmBeforeUpdate),
    rescanAfterUpdate: read.boolean("rescanAfterUpdate", DEFAULTS.rescanAfterUpdate),
    packageSort: read.oneOf("packageSort", PACKAGE_SORTS, DEFAULTS.packageSort),
    noteColumn: read.oneOf("noteColumn", NOTE_COLUMNS, DEFAULTS.noteColumn),
    animations: read.boolean("animations", DEFAULTS.animations),
    notifyOnDone: read.boolean("notifyOnDone", DEFAULTS.notifyOnDone),
    showIncompatibleProviders: read.boolean(
      "showIncompatibleProviders",
      DEFAULTS.showIncompatibleProviders,
    ),
    density: read.oneOf("density", DENSITIES, DEFAULTS.density),
    glyphs: read.oneOf("glyphs", GLYPH_PREFERENCES, DEFAULTS.glyphs),
    mouse: read.boolean("mouse", DEFAULTS.mouse),
  }),
});
