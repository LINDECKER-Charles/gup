import type { LogThreshold } from "../../core/log/log.js";
import { PERIOD_CYCLE, presetPeriod, type PeriodPreset } from "../../core/time/period.js";
import type {
  OptionRow,
  OptionsControls,
  OptionsHost,
  SectionFactory,
} from "../panels/options/option-row.js";
import {
  choiceRow,
  choicesOf,
  switchChoices,
  type Choice,
} from "../panels/options/option-rows.js";
import { periodLabel } from "../text/journal/activity-labels.js";
import { LOG_SOURCE_LABELS, thresholdLabel } from "../text/journal/log-labels.js";
import {
  JOURNAL_OPTION_HINTS,
  JOURNAL_OPTION_LABELS,
  JOURNAL_OPTIONS_TITLE,
  LOG_LEVEL_VALUES,
} from "../text/settings/journal-options-labels.js";
import { seg, type Line } from "../tui/styled-lines.js";

/**
 * JOURNAL, the Options rows of the journal settings, added through the
 * view's extension point: how much the debug log records, the period the
 * Journal opens on, whether an HTML report opens in the browser. Each row
 * writes its own section and its consumer follows it at once — the log
 * session, the Journal when it next comes to the front, the next report.
 */

/** The debug log's level in effect, and what decided it. */
export interface LogLevelInEffect {
  readonly threshold: LogThreshold;
  readonly source: keyof typeof LOG_SOURCE_LABELS;
}

export interface JournalOptionsPorts {
  /** Read at each draw: `--log-level` and `GUP_LOG_LEVEL` win over the row. */
  readonly logLevel: () => LogLevelInEffect;
}

/** Sources that decide the level whatever the setting says. */
const OVERRIDING_SOURCES: ReadonlySet<LogLevelInEffect["source"]> = new Set(["flag", "env"]);

export function journalOptions(ports: JournalOptionsPorts): SectionFactory {
  return (controls, host) => {
    const rows = [
      logLevelRow(controls, host, ports),
      periodRow(controls, host),
      openReportRow(controls, host),
    ];
    return { id: "journal", title: JOURNAL_OPTIONS_TITLE, rows: () => rows };
  };
}

function logLevelRow(
  controls: OptionsControls,
  host: OptionsHost,
  ports: JournalOptionsPorts,
): OptionRow {
  const row = choiceRow({
    id: "logLevel",
    label: JOURNAL_OPTION_LABELS.logLevel,
    choices: choicesOf(LOG_LEVEL_VALUES),
    hint: JOURNAL_OPTION_HINTS.logLevel,
    read: () => host.settings.get("log").level,
    write: (level) => controls.save(() => host.settings.update("log", { level })),
  });
  return { ...row, hint: () => overrideHint(ports.logLevel()) ?? row.hint() };
}

/** When the flag or the environment set this run's level, the row says which and what. */
function overrideHint({ threshold, source }: LogLevelInEffect): Line | null {
  if (!OVERRIDING_SOURCES.has(source)) return null;
  const level = thresholdLabel(threshold);
  return [seg(JOURNAL_OPTION_HINTS.overridden(LOG_SOURCE_LABELS[source], level), "warning")];
}

function periodRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  return choiceRow({
    id: "journalPeriod",
    label: JOURNAL_OPTION_LABELS.period,
    choices: periodChoices(),
    hint: JOURNAL_OPTION_HINTS.period,
    read: () => host.settings.get("journal").period,
    write: (period) => controls.save(() => host.settings.update("journal", { period })),
  });
}

function openReportRow(controls: OptionsControls, host: OptionsHost): OptionRow {
  return choiceRow({
    id: "openReport",
    label: JOURNAL_OPTION_LABELS.openReport,
    choices: switchChoices(),
    hint: JOURNAL_OPTION_HINTS.openReport,
    read: () => host.settings.get("journal").openReport,
    write: (openReport) => controls.save(() => host.settings.update("journal", { openReport })),
  });
}

/** The Journal's presets in its own words ("30 derniers jours"…), shortest first. */
function periodChoices(): Choice<PeriodPreset>[] {
  const now = new Date();
  return PERIOD_CYCLE.map((value) => ({ value, label: periodLabel(presetPeriod(value, now)) }));
}
