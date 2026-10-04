import { PERIOD_CYCLE, type PeriodPreset } from "../time/period.js";
import { defineSection } from "./section.js";

/**
 * The `journal` section: the period the Journal view opens on, and whether
 * an HTML report written for the user (the Journal's `o`, the run results'
 * `o`, `gup report`) opens in the browser. `gup report --open`/`--no-open`
 * still win for one run.
 */

export interface JournalSettings {
  readonly period: PeriodPreset;
  readonly openReport: boolean;
}

const DEFAULTS: JournalSettings = Object.freeze({ period: "12m", openReport: true });

export const JOURNAL_SECTION = defineSection<JournalSettings>({
  key: "journal",
  version: 1,
  defaults: DEFAULTS,
  parse: (read) => ({
    period: read.oneOf("period", PERIOD_CYCLE, DEFAULTS.period),
    openReport: read.boolean("openReport", DEFAULTS.openReport),
  }),
});
