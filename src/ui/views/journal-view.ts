import { presetPeriod, type PeriodPreset } from "../../core/time/period.js";
import type { ResultAction, ViewDefinition } from "../app/view-definition.js";
import { exportNotice, JournalPanel } from "../panels/journal/journal-panel.js";
import type { JournalSource } from "../panels/journal/journal-source.js";
import { settingsService, type SettingsService } from "../settings/settings-service.js";
import { EXPORT_LABELS, JOURNAL_HINTS, JOURNAL_LABELS } from "../text/journal/journal-labels.js";

export interface JournalViewPorts {
  /** The journal settings (the period it opens on); default: the process-wide service. */
  readonly settings?: () => SettingsService;
  /** A schedule's name from its id, for the event detail; undefined when unknown. */
  readonly scheduleName?: (scheduleId: string) => string | undefined;
}

/**
 * Journal: the activity of a period — at a glance, per package, event by
 * event — and the debug log, read when the view comes to the front. The
 * source (history, log, exports) and the schedule names are the composition
 * root's. It also adds `o rapport HTML` to the results of an update run in
 * the screen: the report of the period the Journal opens on, which ends with
 * that run.
 */
export function journalView(source: JournalSource, ports: JournalViewPorts = {}): ViewDefinition {
  const settings = ports.settings ?? settingsService;
  const defaultPeriod = (): PeriodPreset => settings().get("journal").period;
  return {
    id: "journal",
    label: JOURNAL_LABELS.view,
    order: 50,
    group: 1,
    create: (context) =>
      new JournalPanel({
        source,
        // A load or an export may finish after the session's screen is gone
        // (the user quit meanwhile): there is nothing left to draw on.
        redraw: () => {
          if (!context.screen.renderer.isDestroyed) context.redraw();
        },
        choose: (spec) => context.dialogs.choose(spec),
        glyphMode: () => context.screen.appearance.glyphMode,
        defaultPeriod,
        ...(ports.scheduleName && { scheduleName: ports.scheduleName }),
      }),
    resultActions: () => [reportAction(source, defaultPeriod)],
  };
}

function reportAction(source: JournalSource, defaultPeriod: () => PeriodPreset): ResultAction {
  return {
    key: "o",
    hint: JOURNAL_HINTS.report,
    pending: EXPORT_LABELS.running,
    run: async () => {
      const period = presetPeriod(defaultPeriod(), new Date());
      return exportNotice(await source.export("html", period));
    },
  };
}
