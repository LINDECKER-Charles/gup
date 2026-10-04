import { describe, expect, it } from "vitest";
import type { ExportFormat, JournalSource } from "../../../src/ui/panels/journal/journal-source.js";
import type { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { EXPORT_LABELS } from "../../../src/ui/text/journal/journal-labels.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { journalView } from "../../../src/ui/views/journal-view.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { schedulesView } from "../../../src/ui/views/schedules-view.js";
import {
  AUDIT_TIMEOUT_MS,
  AUDITED_ROWS,
  auditMenu,
  escape,
  LEGACY_ON_WHITE,
  type Audit,
  type Audited,
} from "../../support/tui/contrast-audit.js";
import { journalData } from "../panels/journal/journal-data.js";
import {
  failedRun,
  FakeSchedulesPort,
  storedSchedule,
} from "../panels/schedules/fake-schedules-port.js";

/**
 * The contrast audit of the information views: the Journal (its four tabs,
 * the export dialog, a success and a failure notice) and Planification (an
 * enabled, a disabled and a failed schedule, the editor and its warning
 * note, the consent and run-now dialogs), under every audited theme.
 */

const REPORT_PATH = "C:\\r\\gup-report.html";

/** The HTML report opens; any other export fails, so both notice tones show. */
const JOURNAL: JournalSource = {
  load: async () => journalData(),
  export: async (format: ExportFormat) =>
    format === "html"
      ? { ok: true, path: REPORT_PATH, opened: true }
      : { ok: false, error: "disque plein" },
};

function schedulesPort(): FakeSchedulesPort {
  const port = new FakeSchedulesPort();
  port.schedules = [
    storedSchedule(),
    storedSchedule({ id: "0badf00d", name: "Navigateurs", enabled: false }),
  ];
  port.state = failedRun("a1b2c3d4");
  return port;
}

function viewsOf(settings: SettingsService) {
  return [
    journalView(JOURNAL),
    optionsView({ settings: () => settings }),
    schedulesView(schedulesPort()),
  ];
}

/** Activité, Récurrence, Événements, Debug; the HTML report; a failed export. */
async function walkTheJournal({ menu, capture }: Audit): Promise<void> {
  await capture("Journal, Activité", "Mises à jour réussies par jour");
  await menu.press("2");
  await capture("Journal, Récurrence", "Paquets les plus souvent");
  await menu.press("3");
  await capture("Journal, Événements", "type : tous (f)");
  await menu.press("4");
  await capture("Journal, Debug", "niveau tout (l)");
  await menu.press("o");
  await capture("Journal, report opened notice", EXPORT_LABELS.opened(REPORT_PATH));
  await menu.press("e");
  await capture("Journal, export dialog", "Exporter le journal");
  await menu.press("down", "down", "enter");
  await capture("Journal, failed export notice", "disque plein");
}

/**
 * The list (a failed run flagged), the editor, the consent dialog, and the
 * notice of a run-now whose packages were all up to date.
 */
async function walkTheSchedules({ menu, capture }: Audit): Promise<void> {
  await menu.press("tab", "up", "enter");
  await capture("Planification, list with a failed run", "Navigateurs");
  await menu.press("enter");
  await capture("Planification, editor", "Modifier « Outils dev »");
  await escape(menu);
  await menu.press("i");
  await capture("Planification, trigger consent", "Activer la planification");
  await escape(menu);
  await menu.press("x");
  await capture("Planification, run-now notice", "Exécution terminée");
}

async function violationsOf(audited: Audited, isLegacy = false): Promise<string[]> {
  const audit = await auditMenu(audited, {
    size: { cols: 110, rows: 30 },
    initialView: "journal",
    scanOnStart: false,
    views: viewsOf,
    ...(isLegacy && { appearance: legacyAppearance }),
  });
  await walkTheJournal(audit);
  await walkTheSchedules(audit);
  return audit.violations();
}

describe("contrast audit of the Journal and Planification", () => {
  it.each(AUDITED_ROWS)(
    "%s: every text ≥ 4.5:1 (AAA 7:1), every border ≥ 3:1",
    async (_label, audited) => {
      expect(await violationsOf(audited)).toEqual([]);
    },
    AUDIT_TIMEOUT_MS,
  );

  it(
    "catches what the theme does not paint: the legacy look on a light terminal",
    async () => {
      expect((await violationsOf(LEGACY_ON_WHITE, true)).length).toBeGreaterThan(0);
    },
    AUDIT_TIMEOUT_MS,
  );
});
