import { describe, expect, it } from "vitest";
import {
  defaultScheduleName,
  MAX_CRON_LENGTH,
  MAX_NAME_LENGTH,
  mayAskForUac,
  MAX_SCHEDULES,
  MAX_TARGETS_PER_SCHEDULE,
  TOO_FREQUENT,
  validateDraft,
  type ValidationContext,
} from "../../../src/core/scheduler/model/validate-schedule.js";
import type { ScheduleDraft } from "../../../src/core/scheduler/model/types.js";
import { providerFacts, target } from "./scheduler-fixtures.js";

const context: ValidationContext = {
  now: new Date("2026-10-03T10:00:00Z"),
  providers: providerFacts({
    winget: {},
    "npm-g": {},
    choco: { displayName: "Chocolatey", canUpdateUnattended: false },
  }),
  existingCount: 0,
};

function draft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return {
    name: "Outils dev",
    recurrence: { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } },
    targets: [target("winget", "Git.Git"), target("npm-g", "typescript")],
    enabled: true,
    options: { catchUp: true },
    ...overrides,
  };
}

const messages = (d: ScheduleDraft, ctx: ValidationContext = context): string[] =>
  validateDraft(d, ctx).map((issue) => `${issue.field}: ${issue.message}`);

describe("validateDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateDraft(draft(), context)).toEqual([]);
  });

  it("bounds the name", () => {
    expect(messages(draft({ name: "  " }))).toEqual(["name: nom requis"]);
    expect(messages(draft({ name: "x".repeat(61) }))).toEqual(["name: 60 caractères au plus"]);
  });

  it("refuses targets that could stand for a whole provider or inject options", () => {
    const targets = [target("winget", ""), target("npm-g", "*"), target("npm-g", "-g")];
    expect(messages(draft({ targets }))).toEqual([
      expect.stringMatching(/^target:0: identifiant de paquet manquant/),
      expect.stringMatching(/^target:1: les jokers/),
      expect.stringMatching(/^target:2: un identifiant de paquet ne commence pas/),
    ]);
  });

  it("refuses unknown providers and providers that always need an administrator", () => {
    const targets = [target("brew", "git"), target("choco", "vlc")];
    expect(messages(draft({ targets }))).toEqual([
      "target:0: Provider inconnu: brew",
      "target:1: « Chocolatey » demande sudo/admin à chaque mise à jour : non planifiable",
    ]);
  });

  it("refuses an empty list, a duplicate and more than the per-schedule maximum", () => {
    expect(messages(draft({ targets: [] }))).toEqual(["targets: au moins un paquet requis"]);
    const twice = [target("winget", "Git.Git"), target("winget", "git.git")];
    expect(messages(draft({ targets: twice }))).toEqual(["target:1: paquet en double"]);
    const many = Array.from({ length: MAX_TARGETS_PER_SCHEDULE + 1 }, (_, i) =>
      target("npm-g", `pkg-${i}`),
    );
    expect(messages(draft({ targets: many }))).toEqual([
      "targets: 50 paquets au plus par planification",
    ]);
  });

  it("refuses more schedules than the maximum", () => {
    expect(messages(draft(), { ...context, existingCount: MAX_SCHEDULES })).toEqual([
      "schedules: 50 planifications au plus",
    ]);
  });

  it("refuses expressions firing more than hourly, or not within a year", () => {
    const cron = (expression: string): ScheduleDraft =>
      draft({ recurrence: { kind: "cron", expression } });
    expect(messages(cron("*/20 * * * *"))).toEqual([`recurrence: ${TOO_FREQUENT}`]);
    expect(messages(cron("0,30 9 * * 1"))).toEqual([`recurrence: ${TOO_FREQUENT}`]);
    expect(messages(cron("0 * * * *"))).toEqual([]);
    expect(messages(cron("0 9 31 2 *"))).toEqual([
      "recurrence: cette expression ne se déclenche pas dans l'année à venir",
    ]);
    expect(messages(cron("0 9 29 2 *"))).toEqual([
      "recurrence: cette expression ne se déclenche pas dans l'année à venir",
    ]);
    expect(messages(cron("60 9 * * *"))).toEqual([
      "recurrence: valeur invalide pour les minutes : 60",
    ]);
  });

  it("bounds a custom expression as it is stored: blanks collapsed", () => {
    const cron = (expression: string): ScheduleDraft =>
      draft({ recurrence: { kind: "cron", expression } });
    expect(messages(cron(" 	 "))).toEqual(["recurrence: expression cron requise"]);
    // Padding does not count: the expression is stored with single spaces.
    expect(messages(cron(`0	9 * * 1-5${" ".repeat(MAX_CRON_LENGTH)}`))).toEqual([]);
    const days = Array.from({ length: 28 }, (_, i) => i + 1).join(",");
    const long = `0 9 ${days} jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov *`;
    expect(long.length).toBeGreaterThan(MAX_CRON_LENGTH);
    expect(messages(cron(long))).toEqual([
      `recurrence: expression cron trop longue (${MAX_CRON_LENGTH} caractères au plus)`,
    ]);
  });

  it("checks the shape of the presets", () => {
    const at = { hour: 24, minute: 0 };
    expect(messages(draft({ recurrence: { kind: "daily", at } }))).toEqual([
      "recurrence: heure invalide (HH:MM attendu)",
    ]);
    const monthly = { kind: "monthly", day: 31, at: { hour: 9, minute: 0 } } as const;
    expect(messages(draft({ recurrence: monthly }))).toEqual([
      "recurrence: jour du mois invalide (1 à 28, ou le dernier)",
    ]);
  });
});

describe("defaultScheduleName", () => {
  it("names a schedule after its first package and how many others", () => {
    expect(defaultScheduleName([target("winget", "Git.Git")])).toBe("Git.Git");
    const three = [target("winget", "Git.Git"), target("npm-g", "a"), target("npm-g", "b")];
    expect(defaultScheduleName(three)).toBe("Git.Git +2");
    expect(defaultScheduleName([])).toBe("planification");
  });

  it("stays within the name limit", () => {
    const name = defaultScheduleName([target("npm-g", "x".repeat(80))]);
    expect(name).toHaveLength(MAX_NAME_LENGTH);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("mayAskForUac", () => {
  it("warns about winget packages only, which may be installed machine-wide", () => {
    expect(mayAskForUac([target("npm-g", "pnpm"), target("winget", "Git.Git")])).toBe(true);
    expect(mayAskForUac([target("npm-g", "pnpm")])).toBe(false);
  });
});
