import { describe, expect, it } from "vitest";
import {
  parseAddArgs,
  parseLauncher,
  type AddOptions,
} from "../../../src/commands/schedule/schedule-args.js";
import { NOT_A_PACKAGE } from "../../../src/ui/text/schedule/schedule-cli-labels.js";

function options(overrides: Partial<AddOptions>): AddOptions {
  return { targets: ["winget:Git.Git"], catchUp: true, disabled: false, ...overrides };
}

const recurrenceOf = (overrides: Partial<AddOptions>) => {
  const parsed = parseAddArgs(options(overrides));
  return parsed.ok ? parsed.draft.recurrence : parsed.errors;
};

describe("parseAddArgs", () => {
  it("builds a draft with a default name, 09:00 and catch-up on", () => {
    expect(parseAddArgs(options({ targets: ["winget:Git.Git", "npm-g:a", "npm-g:b"], every: "daily" }))).toEqual({
      ok: true,
      draft: {
        name: "Git.Git +2",
        recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
        targets: [
          { providerId: "winget", packageId: "Git.Git" },
          { providerId: "npm-g", packageId: "a" },
          { providerId: "npm-g", packageId: "b" },
        ],
        enabled: true,
        options: { catchUp: true },
      },
    });
  });

  it("reads weekdays in French, English or as cron numbers", () => {
    for (const [on, weekday] of [["lun", 1], ["Lundi", 1], ["sun", 0], ["7", 0], ["sam", 6]] as const) {
      expect(recurrenceOf({ every: "weekly", on, at: "7:30" })).toEqual({
        kind: "weekly",
        weekday,
        at: { hour: 7, minute: 30 },
      });
    }
  });

  it("reads a day of the month or its last day", () => {
    expect(recurrenceOf({ every: "monthly", on: "15" })).toMatchObject({ kind: "monthly", day: 15 });
    expect(recurrenceOf({ every: "monthly", on: "dernier" })).toMatchObject({ day: "last" });
    expect(recurrenceOf({ every: "MONTHLY", on: "last" })).toMatchObject({ day: "last" });
  });

  it("keeps a cron expression for the model to validate", () => {
    expect(recurrenceOf({ cron: "0 9 * * 1-5" })).toEqual({ kind: "cron", expression: "0 9 * * 1-5" });
  });

  it.each([
    [{}, 'fréquence requise : --every <daily|weekly|monthly> ou --cron "<m h j mois js>"'],
    [{ every: "daily", cron: "0 9 * * *" }, "--every et --cron s'excluent : choisissez l'un des deux"],
    [{ every: "hourly" }, "--every : daily, weekly ou monthly attendu (reçu « hourly »)"],
    [{ every: "daily", at: "25:00" }, "--at : heure HH:MM attendue (reçu « 25:00 »)"],
    [{ every: "daily", at: "9h" }, "--at : heure HH:MM attendue (reçu « 9h »)"],
    [{ every: "daily", on: "lun" }, "--on ne s'applique qu'à --every weekly ou monthly"],
    [{ every: "weekly" }, "--on : jour de la semaine attendu (lun, mar… dim)"],
    [{ every: "weekly", on: "funday" }, "--on : jour de la semaine attendu (lun, mar… dim)"],
    [{ every: "weekly", on: "constructor" }, "--on : jour de la semaine attendu (lun, mar… dim)"],
    [{ every: "monthly", on: "31" }, "--on : jour du mois attendu (1 à 28, ou dernier)"],
    [{ cron: "0 9 * * *", at: "10:00" }, "--on et --at ne s'appliquent pas à --cron : l'expression dit tout"],
  ] as const)("refuses %j", (overrides, error) => {
    expect(parseAddArgs(options(overrides))).toEqual({ ok: false, errors: [error] });
  });

  it("refuses a bare provider once, with an example, and lists every other problem", () => {
    expect(parseAddArgs(options({ targets: ["winget", "npm-g", "x:*"] }))).toEqual({
      ok: false,
      errors: [
        NOT_A_PACKAGE,
        "« x:* » : les jokers (* ?) sont refusés — une planification vise des paquets précis",
        'fréquence requise : --every <daily|weekly|monthly> ou --cron "<m h j mois js>"',
      ],
    });
  });

  it("honours --name, --no-catch-up and --disabled", () => {
    const parsed = parseAddArgs(options({ every: "daily", name: "  Navigateurs ", catchUp: false, disabled: true }));
    expect(parsed).toMatchObject({
      ok: true,
      draft: { name: "Navigateurs", enabled: false, options: { catchUp: false } },
    });
  });
});

describe("parseLauncher", () => {
  it("accepts headless and direct only", () => {
    expect(parseLauncher(undefined)).toBeUndefined();
    expect(parseLauncher("direct")).toBe("direct");
    expect(parseLauncher("hidden")).toEqual({ error: "--launcher : headless ou direct attendu (reçu « hidden »)" });
  });
});
