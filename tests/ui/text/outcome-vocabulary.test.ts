import { describe, expect, it } from "vitest";
import { MANUAL_SKIP_MESSAGE } from "../../../src/core/update/finalize-outcome.js";
import { KPI_LABELS } from "../../../src/ui/text/journal/activity-labels.js";
import { EVENT_LABELS } from "../../../src/ui/text/journal/journal-labels.js";
import { UPDATE_STATUS_LABELS } from "../../../src/ui/text/journal/log-labels.js";
import {
  RUN_MESSAGES,
  RUN_NOTIFICATION,
  RUN_SUMMARY,
} from "../../../src/ui/text/run-labels.js";
import {
  runStatusLabel,
  targetResultLabel,
} from "../../../src/ui/text/schedule/schedule-labels.js";

/**
 * An update's outcome agrees with « mise à jour » wherever gup tells it — the
 * run view's rows and summary, the end-of-run notification, a schedule's
 * last run, the Journal — and a count agrees with its number, never `(s)`.
 */
describe("the words of an update's outcome", () => {
  it("say « ignorée » for a skip, in the run as in the Journal", () => {
    expect(MANUAL_SKIP_MESSAGE).toMatch(/^ignorée /);
    expect(RUN_SUMMARY.skipped(1)).toBe("1 ignorée");
    expect(RUN_SUMMARY.skipped(2)).toBe("2 ignorées");
    expect(KPI_LABELS.skips(1)).toBe("1 ignorée");
    expect(KPI_LABELS.skips(2)).toBe("2 ignorées");
    expect(UPDATE_STATUS_LABELS.skipped).toBe("ignorée");
    expect(EVENT_LABELS.types.skips).toBe("ignorées");
    expect(targetResultLabel({ target: "a:b", status: "skipped", message: "hors ligne" })).toBe(
      "ignorée — hors ligne",
    );
  });

  it("say « annulée » for an update the stop left out", () => {
    expect(RUN_MESSAGES.cancelled).toMatch(/^annulée /);
    expect(RUN_SUMMARY.cancelled(1)).toBe("1 annulée");
    expect(RUN_SUMMARY.cancelled(3)).toBe("3 annulées");
  });

  it("agree with their count in every summary", () => {
    expect(RUN_SUMMARY.failed(1)).toBe("1 échec");
    expect(RUN_SUMMARY.failed(2)).toBe("2 échecs");
    expect(RUN_NOTIFICATION.body(1, 2, 0)).toBe(
      "Mise à jour terminée : 1 mis à jour, 2 ignorées, 0 échec.",
    );
    const run = (statuses: readonly ("updated" | "failed" | "skipped")[], status: "partial") => ({
      kind: "on-time" as const,
      status,
      startedAt: "2026-10-05T08:00:00.000Z",
      finishedAt: "2026-10-05T08:01:00.000Z",
      targets: statuses.map((target) => ({ target: `a:${target}`, status: target })),
    });
    expect(runStatusLabel(run(["updated", "skipped"], "partial"))).toBe("± 1/2 — 1 ignorée");
    expect(runStatusLabel(run(["updated", "failed", "failed"], "partial"))).toBe("± 1/3 — 2 échecs");
  });
});
