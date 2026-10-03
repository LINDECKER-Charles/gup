import { describe, expect, it } from "vitest";
import type { ScheduleRunRecord, TargetResult } from "../../../src/core/scheduler/model/types.js";
import {
  recurrenceLabel,
  runStatusLabel,
  targetResultLabel,
  triggerLine,
} from "../../../src/ui/text/schedule-labels.js";

// TZ=UTC: local time is UTC.
const NOW = new Date("2026-10-05T10:00:00Z");
const at = { hour: 9, minute: 5 };

function record(statuses: readonly TargetResult["status"][], status: ScheduleRunRecord["status"]) {
  return {
    kind: "on-time",
    status,
    startedAt: "x",
    finishedAt: "y",
    targets: statuses.map((s) => ({ target: "a:b", status: s })),
  } as const;
}

describe("recurrenceLabel", () => {
  it("says each recurrence in French", () => {
    expect(recurrenceLabel({ kind: "daily", at })).toBe("chaque jour à 09:05");
    expect(recurrenceLabel({ kind: "weekly", weekday: 1, at })).toBe("chaque lundi à 09:05");
    expect(recurrenceLabel({ kind: "weekly", weekday: 0, at })).toBe("chaque dimanche à 09:05");
    expect(recurrenceLabel({ kind: "monthly", day: 15, at })).toBe("le 15 de chaque mois à 09:05");
    expect(recurrenceLabel({ kind: "monthly", day: 1, at })).toBe("le 1er de chaque mois à 09:05");
    expect(recurrenceLabel({ kind: "monthly", day: "last", at })).toBe(
      "le dernier jour du mois à 09:05",
    );
    expect(recurrenceLabel({ kind: "cron", expression: " 0 */6 * * * " })).toBe("cron : 0 */6 * * *");
  });
});

describe("runStatusLabel", () => {
  it("summarises a run in a few characters", () => {
    expect(runStatusLabel(undefined)).toBe("—");
    expect(runStatusLabel(record(["updated", "updated", "no-update"], "success"))).toBe("✔ 2 mis à jour");
    expect(runStatusLabel(record(["no-update"], "up-to-date"))).toBe("✔ à jour");
    expect(runStatusLabel(record(["updated", "failed", "failed"], "partial"))).toBe("◐ 1/3 — 2 échec(s)");
    expect(runStatusLabel(record(["updated", "skipped"], "partial"))).toBe("◐ 1/2 — 1 ignoré(s)");
    expect(runStatusLabel(record(["failed"], "failed"))).toBe("✖ 1 échec(s)");
    expect(runStatusLabel(record(["skipped"], "skipped"))).toBe("↷ ignorée");
    expect(runStatusLabel(record([], "missed"))).toBe("– manquée");
  });
});

describe("targetResultLabel", () => {
  it("says what happened to one package", () => {
    expect(targetResultLabel({ target: "a:b", status: "updated", from: "1", to: "2" })).toBe("1 → 2");
    expect(targetResultLabel({ target: "a:b", status: "no-update" })).toBe("aucune mise à jour");
    expect(targetResultLabel({ target: "a:b", status: "failed", message: "1603" })).toBe("échec — 1603");
    expect(targetResultLabel({ target: "a:b", status: "skipped", message: "hors ligne" })).toBe(
      "ignoré — hors ligne",
    );
  });
});

describe("triggerLine", () => {
  const context = { mechanism: "windows-task", now: NOW, repair: "i" } as const;

  it("says each state of the trigger, with the repair gesture of the surface", () => {
    const lastTickAt = new Date("2026-10-05T09:56:00Z");
    expect(triggerLine({ kind: "active", lastTickAt }, context)).toBe(
      "Déclencheur : actif · Planificateur de tâches Windows · dernier passage il y a 4 min",
    );
    expect(triggerLine({ kind: "active", lastTickAt: null }, context)).toBe(
      "Déclencheur : actif · Planificateur de tâches Windows · aucun passage encore",
    );
    expect(triggerLine({ kind: "not-installed" }, context)).toBe(
      "Déclencheur : non installé — i pour l'installer",
    );
    expect(triggerLine({ kind: "stale", since: new Date("2026-10-05T08:00:00Z") }, context)).toBe(
      "⚠ Aucun passage depuis 2 h 00 — i pour réparer",
    );
    expect(triggerLine({ kind: "outdated" }, context)).toBe(
      "Déclencheur : chemin de gup obsolète — i pour réparer",
    );
    expect(triggerLine({ kind: "foreign", entry: "C:\\other\\cli.js" }, context)).toBe(
      "planification enregistrée pour une autre installation de gup : C:\\other\\cli.js — " +
        "i pour utiliser celle-ci",
    );
    expect(triggerLine({ kind: "disabled-by-user" }, { ...context, mechanism: "launchd" })).toBe(
      "Déclencheur désactivé dans Réglages Système › Général › Ouverture — réactivez-le ou i",
    );
    expect(triggerLine({ kind: "none" }, context)).toBe("");
  });
});
