import { describe, expect, it, vi } from "vitest";
import type { Schedule } from "../../../../src/core/scheduler/model/types.js";
import {
  SchedulesPanel,
  type EditorHandlers,
  type ListHandlers,
} from "../../../../src/ui/panels/schedules/schedules-panel.js";
import type { TriggerSummary } from "../../../../src/ui/panels/schedules/schedules-port.js";
import {
  EMPTY_SCHEDULES,
  SCHEDULE_NOTICES,
  SCHEDULES_HINTS,
} from "../../../../src/ui/text/schedule/schedule-menu-labels.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";
import type { Line } from "../../../../src/ui/tui/styled-lines.js";
import { FakeSchedulesPort, storedSchedule } from "./fake-schedules-port.js";

const WIDE = { width: 90, height: 24 };
const NARROW = { width: 60, height: 24 };

const key = (name: string, sequence = name.length === 1 ? name : ""): KeyPress => ({
  name,
  sequence,
  ctrl: false,
});
const ctrl = (name: string): KeyPress => ({ name, sequence: "", ctrl: true });

const text = (lines: readonly Line[]): string[] =>
  lines.map((line) => line.map((segment) => segment.text).join("").trimEnd());

function setup(schedules: readonly Schedule[] = [storedSchedule()]) {
  const port = new FakeSchedulesPort();
  port.schedules = [...schedules];
  const list: ListHandlers = {
    shown: vi.fn(),
    toggle: vi.fn(),
    runNow: vi.fn(),
    remove: vi.fn(),
    repairTrigger: vi.fn(),
  };
  const editor: EditorHandlers = {
    chooseFrequency: vi.fn(),
    chooseDay: vi.fn(),
    addTarget: vi.fn(),
    save: vi.fn(),
    leave: vi.fn(),
    cancel: vi.fn(),
  };
  const panel = new SchedulesPanel(port, { list, editor });
  const press = (...keys: readonly KeyPress[]): void => keys.forEach((k) => panel.press(k));
  return { port, panel, list, editor, press, render: (viewport = WIDE) => text(panel.render(viewport)) };
}

const active: TriggerSummary = {
  health: { kind: "active", lastTickAt: new Date("2026-10-05T09:56:00Z") },
  mechanism: "windows-task",
};

describe("SchedulesPanel, list", () => {
  it("tells how to schedule when there is nothing yet, with no key of its own", () => {
    const { render, panel } = setup([]);
    expect(render().filter(Boolean)).toEqual(EMPTY_SCHEDULES.map((line) => `  ${line}`));
    expect(panel.title).toBe("Planification");
    expect(panel.hints()).toBe("");
  });

  it("wraps that how-to under its indent on an 80-column terminal, down to its key", () => {
    const { render } = setup([]);
    const width = 52;
    const lines = render({ width, height: 24 }).filter(Boolean);
    expect(lines.length).toBeGreaterThan(EMPTY_SCHEDULES.length);
    expect(lines.every((line) => line.length <= width && line.startsWith("  "))).toBe(true);
    expect(lines.map((line) => line.trim()).join(" ")).toBe(EMPTY_SCHEDULES.join(" "));
  });

  it("lists the schedules under the trigger's state, the one under the cursor detailed", () => {
    const { render, panel } = setup([
      storedSchedule(),
      storedSchedule({ id: "0badf00d", name: "Python", enabled: false }),
    ]);
    expect(render()[0]).toBe("Déclencheur : vérification…");
    panel.setTrigger(active);
    const lines = render();
    expect(lines[0]).toBe(
      "Déclencheur : actif · Planificateur de tâches Windows · dernier passage il y a 4 min",
    );
    expect(lines[2]).toMatch(/^ {4}Nom +Fréquence +Paquets Prochaine +Dernière$/);
    expect(lines[3]).toMatch(/^› ● Outils dev +chaque jour à 09:00 +1 demain 09:00 +—$/);
    expect(lines[4]).toMatch(/^ {2}○ Python .* désactivée +—$/);
    expect(lines.slice(6)).toEqual([
      "Prochaine : demain 09:00 · cron 0 9 * * *",
      "Jamais exécutée.",
      "  · Winget         Git.Git",
    ]);
  });

  it("tells how to repair a trigger that does not run, in the trigger line", () => {
    const { render, panel } = setup();
    panel.setTrigger({ health: { kind: "not-installed" }, mechanism: "crontab" });
    expect(render()[0]).toBe("Déclencheur : non installé — i pour l'installer");
    panel.setTrigger({ health: { kind: "none" }, mechanism: null, unsupported: "pas ici" });
    expect(render()[0]).toMatch(/^ {4}Nom/);
    panel.setTrigger({ health: { kind: "not-installed" }, mechanism: null, unsupported: "pas ici" });
    expect(render()[0]).toBe("Déclencheur : pas ici");
  });

  it("drops the count and the next run on a narrow panel", () => {
    const { render, panel } = setup();
    panel.setTrigger(active);
    expect(render(NARROW)[2]).toMatch(/^ {4}Nom +Fréquence +Dernière$/);
  });

  it("sizes Fréquence to its labels on an 80-column terminal, Dernière to its own", () => {
    const { render, panel } = setup([
      storedSchedule({ recurrence: { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } } }),
      storedSchedule({
        id: "0badf00d",
        name: "Python",
        recurrence: { kind: "monthly", day: 15, at: { hour: 9, minute: 0 } },
      }),
    ]);
    panel.setTrigger(active);
    const lines = render({ width: 52, height: 24 });
    expect(lines[2]).toMatch(/^ {4}Nom +Fréquence +Dernière$/);
    expect(lines[3]).toBe("› ● Outils dev chaque lundi à 09:00         —");
    expect(lines[4]).toBe("  ● Python     le 15 de chaque mois à 09:00 —");
  });

  // 50: the panel's content on an 80-column terminal, beside the sidebar.
  it("keeps every recurrence whole at 80 columns, the last run told by its mark", () => {
    const monthly = (day: number | "last") => ({
      kind: "monthly" as const,
      day,
      at: { hour: 9, minute: 0 },
    });
    const { port, render, panel } = setup([
      storedSchedule({ recurrence: { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } } }),
      storedSchedule({ id: "0badf00d", name: "Mensuel", recurrence: monthly(15) }),
      storedSchedule({ id: "0ddba11a", name: "Fin de mois", recurrence: monthly("last") }),
    ]);
    port.state = {
      v: 1,
      schedules: {
        "0badf00d": {
          lastRun: {
            kind: "on-time",
            status: "failed",
            startedAt: "2026-10-05T08:00:00.000Z",
            finishedAt: "2026-10-05T08:01:00.000Z",
            targets: [{ target: "winget:Git.Git", status: "failed", message: "1603" }],
          },
        },
      },
    };
    port.reload();
    panel.setTrigger(active);
    const lines = render({ width: 50, height: 24 });
    expect(lines[2]).toMatch(/^ {4}Nom +Fréquence$/);
    expect(lines[3]).toMatch(/^› ● Outils dev +chaque lundi à 09:00 +—$/);
    expect(lines[4]).toMatch(/^ {2}● Mensuel +le 15 de chaque mois à 09:00 +✖$/);
    expect(lines[5]).toMatch(/^ {2}● Fin de mois le dernier jour du mois à 09:00 —$/);
    expect(lines.slice(2, 6).every((line) => line.length <= 50)).toBe(true);
  });

  it("keeps the count and the next run on a 120-column terminal, the longest recurrence whole", () => {
    const { render, panel } = setup([
      storedSchedule({ recurrence: { kind: "monthly", day: "last", at: { hour: 9, minute: 0 } } }),
    ]);
    panel.setTrigger(active);
    const lines = render(WIDE);
    expect(lines[2]).toMatch(/^ {4}Nom +Fréquence +Paquets Prochaine +Dernière$/);
    expect(lines[3]).toMatch(/^› ● Outils dev le dernier jour du mois à 09:00 +1 \S.* —$/);
  });

  it("narrows the wider of name and recurrence once the last run is down to its mark", () => {
    const { render, panel } = setup([
      storedSchedule({
        name: "Outils de développement",
        recurrence: { kind: "monthly", day: "last", at: { hour: 9, minute: 0 } },
      }),
    ]);
    panel.setTrigger(active);
    const [header, row] = render({ width: 52, height: 24 }).slice(2);
    expect(header).toMatch(/^ {4}Nom +Fréquence$/);
    expect(row).toBe("› ● Outils de développeme… le dernier jour du moi… —");
  });

  it("details the last run: when, how long, each package's result", () => {
    const { port, render, panel } = setup();
    port.state = {
      v: 1,
      schedules: {
        a1b2c3d4: {
          lastRun: {
            kind: "catch-up",
            status: "partial",
            startedAt: "2026-10-05T08:00:00.000Z",
            finishedAt: "2026-10-05T08:02:14.000Z",
            targets: [
              { target: "winget:Git.Git", status: "updated", from: "2.46.0", to: "2.47.0" },
              { target: "npm-g:pnpm", status: "no-update" },
              { target: "choco:vlc", status: "skipped", message: "droits administrateur requis" },
            ],
          },
        },
      },
    };
    port.reload();
    panel.setTrigger(active);
    expect(render().slice(6)).toEqual([
      "Dernière exécution · Outils dev · il y a 1 h · 2 min 14 s · rattrapage",
      "  ✔ Winget         Git.Git              2.46.0 → 2.47.0",
      "  = npm (global)   pnpm                 aucune mise à jour",
      "  ↷ Chocolatey     vlc                  ignorée — droits administrateur requis",
    ]);
  });

  it("hands each key's action on the schedule under the cursor to the flows", () => {
    const second = storedSchedule({ id: "0badf00d", name: "Python" });
    const { press, list } = setup([storedSchedule(), second]);
    press(key("down"), key("space"), key("x"), key("delete"), key("d"), key("i"));
    expect(list.toggle).toHaveBeenCalledWith(second);
    expect(list.runNow).toHaveBeenCalledWith(second);
    expect(list.remove).toHaveBeenCalledTimes(2);
    expect(list.repairTrigger).toHaveBeenCalledOnce();
  });

  it("says which way espace switches the schedule under the cursor", () => {
    const off = storedSchedule({ id: "0badf00d", name: "Python", enabled: false });
    const { panel, press } = setup([storedSchedule(), off]);
    expect(panel.hints()).toContain("espace désactiver");
    press(key("down"));
    expect(panel.hints()).toContain("espace activer");
    expect(panel.hints()).toBe(SCHEDULES_HINTS.list(false));
  });

  it("keeps the cursor on its schedule when the list changes", () => {
    const { port, panel, press, list } = setup([
      storedSchedule(),
      storedSchedule({ id: "0badf00d", name: "Python" }),
    ]);
    press(key("down"));
    port.schedules = [storedSchedule({ id: "cafe0001", name: "Neuve" }), ...port.schedules];
    port.reload();
    panel.press(key("x"));
    expect(list.runNow).toHaveBeenCalledWith(expect.objectContaining({ id: "0badf00d" }));
  });

  it("selects a schedule by a click on its row", () => {
    const { panel, list } = setup([storedSchedule(), storedSchedule({ id: "0badf00d" })]);
    panel.setTrigger(active);
    panel.click(4, WIDE);
    panel.press(key("x"));
    expect(list.runNow).toHaveBeenCalledWith(expect.objectContaining({ id: "0badf00d" }));
  });

  it("shows a notice until the next key", () => {
    const { panel, render, press } = setup();
    panel.setTrigger(active);
    panel.setNotice([[{ text: "✔ enregistrée", tone: "success" }]]);
    expect(render()[0]).toBe("✔ enregistrée");
    press(key("down"));
    expect(render()[0]).toMatch(/^Déclencheur/);
  });

  it.each([
    ["an 80-column terminal", 52],
    ["a 120-column terminal", 92],
  ])("wraps a trigger failure on %s instead of cutting its reason", (_terminal, width) => {
    const second = storedSchedule({ id: "0badf00d", name: "Python" });
    const { panel, render, list } = setup([storedSchedule(), second]);
    panel.setTrigger(active);
    const reason = "ERREUR : le Planificateur de tâches a refusé l'enregistrement (0x80070005)";
    const notice = SCHEDULE_NOTICES.triggerFailed(reason);
    panel.setNotice([[{ text: notice, tone: "warning" }]]);
    const viewport = { width, height: 24 };
    const lines = render(viewport);
    const shown = lines.slice(0, lines.findIndex((line) => line.startsWith("Déclencheur")));
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.every((line) => line.length <= width)).toBe(true);
    expect(shown.join(" ")).toBe(notice);
    panel.click(lines.findIndex((line) => line.includes("Python")), viewport);
    panel.press(key("x"));
    expect(list.runNow).toHaveBeenCalledWith(second);
  });

  it("says when the view comes to the front", () => {
    const { panel, list } = setup();
    panel.onShow();
    expect(list.shown).toHaveBeenCalledOnce();
  });
});

describe("SchedulesPanel, editor", () => {
  function editing() {
    const context = setup();
    context.press(key("return"));
    return context;
  }

  it("opens the schedule under the cursor in the form", () => {
    const { panel, render } = editing();
    expect(panel.title).toBe("Modifier « Outils dev »");
    expect(panel.hints()).toBe(SCHEDULES_HINTS.editor);
    expect(render().slice(0, 4)).toEqual([
      "› Nom              [Outils dev]",
      "  Fréquence        [Chaque jour]",
      "  Heure            [09:00]",
      "  Rattrapage       [oui]   relance à la prochaine occasion si l'heure est manquée",
    ]);
  });

  it("types a name in place, the menu's keys going to the field", () => {
    const { panel, press, render } = editing();
    press(key("return"));
    expect(panel.isCapturingText).toBe(true);
    expect(panel.hints()).toBe(SCHEDULES_HINTS.typing);
    press(key("backspace"), key("backspace"), key("backspace"), key("q"), key("space", " "));
    expect(render()[0]).toBe("› Nom              Outils q █");
    press(key("return"));
    expect(panel.isCapturingText).toBe(false);
    expect(render()[0]).toBe("› Nom              [Outils q ]");
  });

  it("previews the next runs of a cron expression as it is typed, and says when it is refused", () => {
    const { panel, press, render } = editing();
    panel.editor?.setKind("cron");
    press(key("down"), key("down"), key("return"));
    for (const character of "0 9 * * 1-5") press(key(character === " " ? "space" : character, character));
    expect(render()).toContain(
      "  cron 0 9 * * 1-5 · prochaines : demain 09:00 · mer. 7 oct. 09:00 · jeu. 8 oct. 09:00",
    );
    press(key("escape"));
    press(key("return"));
    for (const character of "*/20 * * * *") press(key(character === " " ? "space" : character, character));
    expect(render()).toContain("  ✖ Fréquence trop élevée — au plus une exécution par heure");
  });

  it("draws Enregistrer muted while something prevents saving", () => {
    const { panel, render } = editing();
    const saveTone = () =>
      panel.render(WIDE).find((line) => line.some((s) => s.text === "[ Enregistrer ]"))?.at(-1)?.tone;
    expect(saveTone()).toBe("accent");
    panel.editor?.addTarget({ providerId: "choco", packageId: "vlc" });
    expect(saveTone()).toBe("muted");
    expect(render()).toContainEqual(
      expect.stringContaining("✖ « Chocolatey » demande sudo/admin à chaque mise à jour"),
    );
  });

  it("hands dialogs and saving to the flows", () => {
    const { panel, press, editor } = editing();
    press(key("down"), key("return"));
    expect(editor.chooseFrequency).toHaveBeenCalledWith(panel.editor);
    panel.editor?.setKind("weekly");
    press(key("down"), key("return"));
    expect(editor.chooseDay).toHaveBeenCalledOnce();
    press(ctrl("s"));
    expect(editor.save).toHaveBeenCalledOnce();
    press(key("end"), key("up"), key("return"));
    expect(editor.save).toHaveBeenCalledTimes(2);
    press(key("up"), key("return"));
    expect(editor.addTarget).toHaveBeenCalledOnce();
    press(key("escape"));
    expect(editor.leave).toHaveBeenCalledOnce();
    press(key("end"), key("return"));
    expect(editor.cancel).toHaveBeenCalledWith(panel.editor);
    expect(editor.leave).toHaveBeenCalledOnce();
  });

  it("saves what is being typed with ctrl+s", () => {
    const { panel, press, editor } = editing();
    press(key("return"), key("x"), ctrl("s"));
    expect(panel.isCapturingText).toBe(false);
    expect(panel.editor?.draft().name).toBe("Outils devx");
    expect(editor.save).toHaveBeenCalledOnce();
  });

  it("toggles the catch-up and removes the package under the cursor", () => {
    const { panel, press } = editing();
    press(key("down"), key("down"), key("down"), key("space"));
    expect(panel.editor?.catchUp).toBe(false);
    press(key("down"), key("delete"));
    expect(panel.editor?.targets).toEqual([]);
  });

  it("goes back to the list when the editor closes", () => {
    const { panel, render } = editing();
    panel.closeEditor();
    expect(panel.title).toBe("Planification");
    expect(render()[0]).toBe("Déclencheur : vérification…");
  });
});
