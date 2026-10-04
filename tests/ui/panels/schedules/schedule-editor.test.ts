import { describe, expect, it } from "vitest";
import type { ScheduleDraft } from "../../../../src/core/scheduler/model/types.js";
import { VALIDATION_MESSAGES } from "../../../../src/core/scheduler/model/validate-schedule.js";
import {
  ScheduleEditor,
  seedOf,
  type EditorItem,
} from "../../../../src/ui/panels/schedules/schedule-editor.js";
import { storedSchedule } from "./fake-schedules-port.js";

const draft: ScheduleDraft = {
  name: "Outils dev",
  recurrence: { kind: "weekly", weekday: 1, at: { hour: 8, minute: 30 } },
  targets: [{ providerId: "winget", packageId: "Git.Git" }],
  enabled: true,
  options: { catchUp: true },
};

const fields = (editor: ScheduleEditor): string[] =>
  editor.items.map((item: EditorItem) => (item.kind === "field" ? item.field : item.kind));

function typeInto(editor: ScheduleEditor, row: number, text: string): void {
  editor.moveTo(row);
  editor.startTyping();
  editor.type(text);
}

describe("ScheduleEditor", () => {
  it("starts from its seed, unchanged", () => {
    const editor = new ScheduleEditor({ draft });
    expect(editor.draft()).toEqual(draft);
    expect(editor.isDirty).toBe(false);
    expect(editor.id).toBeUndefined();
  });

  it("shows the fields the recurrence needs", () => {
    const editor = new ScheduleEditor({ draft });
    const tail = ["catchUp", "target", "add", "save", "cancel"];
    expect(fields(editor)).toEqual(["name", "frequency", "day", "time", ...tail]);
    editor.setKind("daily");
    expect(fields(editor)).toEqual(["name", "frequency", "time", ...tail]);
    editor.setKind("cron");
    expect(fields(editor)).toEqual(["name", "frequency", "cron", ...tail]);
  });

  it("keeps the other presets' values while the frequency changes", () => {
    const editor = new ScheduleEditor({ draft });
    editor.setKind("monthly");
    editor.setMonthDay("last");
    expect(editor.draft().recurrence).toEqual({ kind: "monthly", day: "last", at: { hour: 8, minute: 30 } });
    editor.setKind("weekly");
    expect(editor.draft().recurrence).toEqual(draft.recurrence);
  });

  it("shows what is typed in the draft at once, keeps it on Entrée, drops it on Échap", () => {
    const editor = new ScheduleEditor({ draft: { ...draft, recurrence: { kind: "cron", expression: "" } } });
    typeInto(editor, 2, "0 9 * * 1-5");
    expect(editor.typing).toEqual({ field: "cron", buffer: "0 9 * * 1-5" });
    expect(editor.draft().recurrence).toEqual({ kind: "cron", expression: "0 9 * * 1-5" });
    editor.erase();
    editor.commitTyping();
    expect(editor.typing).toBeNull();
    expect(editor.text("cron")).toBe("0 9 * * 1-");
    typeInto(editor, 0, " (bis)");
    editor.cancelTyping();
    expect(editor.draft().name).toBe("Outils dev");
  });

  it("only types into text fields, within their length", () => {
    const editor = new ScheduleEditor({ draft });
    editor.moveTo(1);
    expect(editor.startTyping()).toBe(false);
    typeInto(editor, 3, "123");
    expect(editor.text("time")).toBe("08:30");
  });

  it("refuses a time that is not HH:MM, and keeps a valid draft meanwhile", () => {
    const editor = new ScheduleEditor({ draft });
    editor.moveTo(3);
    editor.startTyping();
    editor.erase();
    editor.erase();
    editor.type("75");
    const invalidTime = { field: "recurrence", message: VALIDATION_MESSAGES.invalidTime };
    expect(editor.ownIssues()).toEqual([invalidTime]);
    expect(editor.draft().recurrence).toMatchObject({ at: { hour: 9, minute: 0 } });
    editor.setKind("cron");
    expect(editor.ownIssues()).toEqual([]);
  });

  it("adds a package once, whatever its case, and removes one", () => {
    const editor = new ScheduleEditor({ draft });
    expect(editor.addTarget({ providerId: "winget", packageId: "git.git" })).toBe(false);
    expect(editor.addTarget({ providerId: "npm-g", packageId: "pnpm" })).toBe(true);
    editor.moveTo(editor.items.length - 1);
    editor.removeTarget(0);
    expect(editor.targets).toEqual([{ providerId: "npm-g", packageId: "pnpm" }]);
    expect(editor.cursor).toBe(editor.items.length - 1);
    expect(editor.isDirty).toBe(true);
  });

  it("toggles the catch-up and knows it changed", () => {
    const editor = new ScheduleEditor({ draft });
    editor.toggleCatchUp();
    expect(editor.draft().options).toEqual({ catchUp: false });
    expect(editor.isDirty).toBe(true);
    editor.toggleCatchUp();
    expect(editor.isDirty).toBe(false);
  });

  it("edits a stored schedule through its editable fields", () => {
    const schedule = storedSchedule();
    const editor = new ScheduleEditor(seedOf(schedule));
    expect(editor.id).toBe(schedule.id);
    const { name, recurrence, targets, enabled, options } = schedule;
    expect(editor.draft()).toEqual({ name, recurrence, targets, enabled, options });
  });
});
