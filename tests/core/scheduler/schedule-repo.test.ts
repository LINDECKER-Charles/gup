import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../../../src/core/config/store.js";
import type { ScheduleDraft } from "../../../src/core/scheduler/model/types.js";
import { ScheduleRepo } from "../../../src/core/scheduler/persistence/schedule-repo.js";
import { target } from "./scheduler-fixtures.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-schedules-"));
  file = join(dir, "schedules.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function repo(ids: readonly string[] = ["a1b2c3d4", "a1b2ffff", "0badf00d"]): ScheduleRepo {
  const queue = [...ids];
  return new ScheduleRepo(() => new ConfigStore({ file }), () => queue.shift() ?? "ffffffff");
}

const draft: ScheduleDraft = {
  name: "  Outils dev ",
  recurrence: { kind: "monthly", day: "last", at: { hour: 9, minute: 0 } },
  targets: [target("winget", "Git.Git")],
  enabled: true,
  options: { catchUp: false },
};

const MONDAY = new Date("2026-10-05T08:00:00Z");

describe("ScheduleRepo", () => {
  it("creates an armed schedule and reads it back from another store", () => {
    const created = repo().create(draft, MONDAY);
    expect(created).toEqual({
      ...draft,
      id: "a1b2c3d4",
      name: "Outils dev",
      createdAt: "2026-10-05T08:00:00.000Z",
      armedAt: "2026-10-05T08:00:00.000Z",
    });
    expect(repo().list()).toEqual([created]);
  });

  it("never reuses an id that exists", () => {
    const first = repo(["a1b2c3d4"]).create(draft, MONDAY);
    const second = repo(["a1b2c3d4", "0badf00d"]).create(draft, MONDAY);
    expect([first.id, second.id]).toEqual(["a1b2c3d4", "0badf00d"]);
  });

  it("finds by unique prefix and explains a short, unknown or ambiguous one", () => {
    const store = repo();
    store.create(draft, MONDAY);
    store.create(draft, MONDAY);
    store.create(draft, MONDAY);
    expect(store.find("0BAD")).toMatchObject({ id: "0badf00d" });
    expect(store.find("a1b")).toEqual({ error: "« a1b » : identifiant de 4 caractères au moins" });
    expect(store.find("cafe")).toEqual({ error: "Aucune planification « cafe »" });
    expect(store.find("a1b2")).toEqual({
      error: "« a1b2 » désigne plusieurs planifications : a1b2c3d4, a1b2ffff",
    });
  });

  it("re-arms on enable, not on disable, and counts only real changes", () => {
    const store = repo();
    const { id } = store.create({ ...draft, enabled: false }, MONDAY);
    const later = new Date("2026-11-01T10:00:00Z");
    expect(store.disable([id])).toBe(0);
    expect(store.enable([id, "deadbeef"], later)).toBe(1);
    expect(store.find(id)).toMatchObject({ enabled: true, armedAt: "2026-11-01T10:00:00.000Z" });
    expect(store.enable([id], new Date("2026-12-01T10:00:00Z"))).toBe(0);
    expect(store.disable([id])).toBe(1);
    expect(store.find(id)).toMatchObject({ enabled: false, armedAt: "2026-11-01T10:00:00.000Z" });
  });

  it("removes by exact id", () => {
    const store = repo();
    const { id } = store.create(draft, MONDAY);
    expect(store.remove(["a1b2", id])).toBe(1);
    expect(store.list()).toEqual([]);
  });

  it("keeps another process's schedule when saving (re-read under the lock)", () => {
    const mine = repo(["a1b2c3d4"]);
    mine.list();
    repo(["0badf00d"]).create(draft, MONDAY);
    mine.create(draft, MONDAY);
    expect(repo().list().map((schedule) => schedule.id)).toEqual(["0badf00d", "a1b2c3d4"]);
  });

  it("sees another process's change only once reloaded", () => {
    const menu = repo();
    expect(menu.list()).toEqual([]);
    repo().create(draft, MONDAY);
    expect(menu.list()).toEqual([]);
    menu.reload();
    expect(menu.list()).toHaveLength(1);
  });
});

describe("ScheduleRepo.replace", () => {
  const later = new Date("2026-10-20T07:00:00Z");
  const cron = (expression: string): ScheduleDraft["recurrence"] => ({ kind: "cron", expression });

  it("keeps the identity and the arming date when only names and packages change", () => {
    const store = repo();
    const created = store.create(draft, MONDAY);
    const edit = { ...draft, name: " Navigateurs ", targets: [target("winget", "Mozilla.Firefox")] };
    expect(store.replace(created.id, edit, later)).toEqual({
      ...created,
      name: "Navigateurs",
      targets: edit.targets,
    });
    expect(store.list()).toEqual([store.find(created.id)]);
  });

  it("re-arms when the recurrence changes or the schedule is switched on", () => {
    const store = repo();
    const { id } = store.create({ ...draft, enabled: false }, MONDAY);
    const retimed = { ...draft, enabled: false, recurrence: cron("0 8 * * 1") };
    expect(store.replace(id, retimed, later)?.armedAt).toBe(later.toISOString());
    const evenLater = new Date("2026-11-02T07:00:00Z");
    const switchedOn = { ...retimed, enabled: true };
    expect(store.replace(id, switchedOn, evenLater)?.armedAt).toBe(evenLater.toISOString());
  });

  it("returns null for a schedule removed in the meantime", () => {
    expect(repo().replace("deadbeef", draft, later)).toBeNull();
  });
});

describe("ScheduleRepo seen runs", () => {
  it("remembers until when runs were seen, through other changes", () => {
    const store = repo();
    expect(store.seenUntil()).toBeNull();
    store.markSeen(MONDAY);
    store.create(draft, MONDAY);
    expect(repo().seenUntil()).toEqual(MONDAY);
  });
});

describe("schedules.json, edited by hand", () => {
  const valid = {
    id: "a1b2c3d4",
    name: "Outils",
    recurrence: { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } },
    targets: [{ providerId: "winget", packageId: "Git.Git", label: "Git" }],
    enabled: true,
    options: { catchUp: true },
    createdAt: "2026-10-01T08:00:00.000Z",
    armedAt: "2026-10-01T08:00:00.000Z",
  };

  async function load(schedules: readonly unknown[]): Promise<ScheduleRepo> {
    const content = { version: 1, sections: { scheduler: { v: 1, schedules } } };
    await writeFile(file, JSON.stringify(content));
    return repo();
  }

  it("reads every recurrence shape back", async () => {
    const shapes = [
      { kind: "daily", at: { hour: 7, minute: 30 } },
      valid.recurrence,
      { kind: "monthly", day: 15, at: { hour: 9, minute: 0 } },
      { kind: "monthly", day: "last", at: { hour: 9, minute: 0 } },
      { kind: "cron", expression: "0 */6 * * *" },
    ];
    const store = await load(shapes.map((recurrence) => ({ ...valid, recurrence })));
    expect(store.list().map((schedule) => schedule.recurrence)).toEqual(shapes);
  });

  it("drops a schedule that is incomplete or malformed, never half of one", async () => {
    const store = await load([
      valid,
      { ...valid, id: "nothex!!" },
      { ...valid, recurrence: { kind: "monthly", day: 31, at: { hour: 9, minute: 0 } } },
      { ...valid, recurrence: { kind: "monthly", day: "first", at: { hour: 9, minute: 0 } } },
      { ...valid, targets: [{ providerId: "winget", packageId: "*" }] },
      { ...valid, armedAt: "yesterday" },
      { ...valid, name: "" },
    ]);
    expect(store.list()).toEqual([valid]);
  });

  it("treats a schedule without an enabled flag as disabled", async () => {
    const { enabled: _enabled, ...withoutFlag } = valid;
    const store = await load([withoutFlag]);
    expect(store.list()[0]?.enabled).toBe(false);
  });

  it("accepts a file larger than a settings file (records, not preferences)", async () => {
    const content = {
      version: 1,
      sections: { scheduler: { v: 1, schedules: [valid], padding: "x".repeat(300 * 1024) } },
    };
    await writeFile(file, JSON.stringify(content));
    expect(ScheduleRepo.open(file).list()).toEqual([valid]);
  });

  it("writes only through the section, keeping what this build does not know", async () => {
    const content = { version: 1, sections: { scheduler: { v: 1, schedules: [], future: 1 } } };
    await writeFile(file, JSON.stringify(content));
    repo().create(draft, MONDAY);
    const written = JSON.parse(await readFile(file, "utf8"));
    expect(written.sections.scheduler.future).toBe(1);
    expect(written.sections.scheduler.schedules).toHaveLength(1);
  });
});
