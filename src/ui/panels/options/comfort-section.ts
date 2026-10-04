import {
  INCOMPATIBLE_VALUES,
  LAUNCH_VIEW_VALUES,
  NOTE_VALUES,
  OPTION_HINTS,
  OPTION_LABELS,
  OPTIONS_SECTIONS,
  SORT_VALUES,
} from "../../text/settings/options-labels.js";
import { LOCALE_NAMES } from "../../../core/i18n/locale.js";
import { LANGUAGE_LABELS } from "../../text/language-labels.js";
import type { SectionFactory } from "./option-row.js";
import { choicesOf, interfaceRow, switchChoices, type RowBuilder } from "./option-rows.js";

/**
 * CONFORT: how the menu behaves. Each row writes one field of the
 * `interface` settings, which the menu reads live through its preferences
 * (sort, Note column, animations, confirmation…) or at its next launch
 * (language, launch view, scan at launch). The mouse also switches on this
 * screen at once.
 */

const COMFORT_ROWS: readonly RowBuilder[] = [
  interfaceRow({
    id: "launchView",
    label: OPTION_LABELS.launchView,
    choices: choicesOf(LAUNCH_VIEW_VALUES),
    hint: OPTION_HINTS.launchView,
    read: (settings) => settings.launchView,
    patch: (launchView) => ({ launchView }),
  }),
  interfaceRow({
    id: "scanOnLaunch",
    label: OPTION_LABELS.scanOnLaunch,
    choices: switchChoices(),
    hint: OPTION_HINTS.scanOnLaunch,
    read: (settings) => settings.scanOnLaunch,
    patch: (scanOnLaunch) => ({ scanOnLaunch }),
  }),
  interfaceRow({
    id: "confirmBeforeUpdate",
    label: OPTION_LABELS.confirm,
    choices: switchChoices(),
    hint: OPTION_HINTS.confirm,
    read: (settings) => settings.confirmBeforeUpdate,
    patch: (confirmBeforeUpdate) => ({ confirmBeforeUpdate }),
  }),
  interfaceRow({
    id: "rescanAfterUpdate",
    label: OPTION_LABELS.rescan,
    choices: switchChoices(),
    hint: OPTION_HINTS.rescan,
    read: (settings) => settings.rescanAfterUpdate,
    patch: (rescanAfterUpdate) => ({ rescanAfterUpdate }),
  }),
  interfaceRow({
    id: "packageSort",
    label: OPTION_LABELS.sort,
    choices: choicesOf(SORT_VALUES),
    hint: OPTION_HINTS.sort,
    read: (settings) => settings.packageSort,
    patch: (packageSort) => ({ packageSort }),
  }),
  interfaceRow({
    id: "noteColumn",
    label: OPTION_LABELS.note,
    choices: choicesOf(NOTE_VALUES),
    hint: OPTION_HINTS.note,
    read: (settings) => settings.noteColumn,
    patch: (noteColumn) => ({ noteColumn }),
  }),
  interfaceRow({
    id: "showIncompatibleProviders",
    label: OPTION_LABELS.incompatible,
    choices: switchChoices({ on: INCOMPATIBLE_VALUES.shown, off: INCOMPATIBLE_VALUES.hidden }),
    hint: OPTION_HINTS.incompatible,
    read: (settings) => settings.showIncompatibleProviders,
    patch: (showIncompatibleProviders) => ({ showIncompatibleProviders }),
  }),
  interfaceRow({
    id: "animations",
    label: OPTION_LABELS.animations,
    choices: switchChoices(),
    hint: OPTION_HINTS.animations,
    read: (settings) => settings.animations,
    patch: (animations) => ({ animations }),
  }),
  interfaceRow({
    id: "mouse",
    label: OPTION_LABELS.mouse,
    choices: switchChoices(),
    hint: OPTION_HINTS.mouse,
    read: (settings) => settings.mouse,
    patch: (mouse) => ({ mouse }),
    apply: (mouse, host) => host.setMouse(mouse),
  }),
  interfaceRow({
    id: "notifyOnDone",
    label: OPTION_LABELS.notify,
    choices: switchChoices(),
    hint: OPTION_HINTS.notify,
    read: (settings) => settings.notifyOnDone,
    patch: (notifyOnDone) => ({ notifyOnDone }),
  }),
];

/**
 * The interface language, first. A builder rather than a row of the table
 * above: its labels are read when the panel opens, in the active language.
 */
const languageRow: RowBuilder = (controls, host) =>
  interfaceRow({
    id: "language",
    label: LANGUAGE_LABELS.optionLabel,
    choices: choicesOf(LOCALE_NAMES),
    hint: LANGUAGE_LABELS.optionHint,
    read: (settings) => settings.language,
    patch: (language) => ({ language }),
  })(controls, host);

export const comfortSection: SectionFactory = (controls, host) => {
  const rows = [languageRow, ...COMFORT_ROWS].map((build) => build(controls, host));
  return { id: "comfort", title: OPTIONS_SECTIONS.comfort, rows: () => rows };
};
