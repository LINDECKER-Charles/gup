import { describe, expect, it, vi } from "vitest";
import type { PreparedRun } from "../../../src/core/scheduler/manual-run.js";
import type { Schedule, SchedulerState } from "../../../src/core/scheduler/model/types.js";
import type { SelectedPackage } from "../../../src/core/types.js";
import { buildReport, type UpdateReport } from "../../../src/core/update/update-report.js";
import type { LaunchRequest, LauncherFactory } from "../../../src/ui/app/update-launcher.js";
import {
  SCHEDULE_ACTION,
  SCHEDULE_NOTICES,
} from "../../../src/ui/text/schedule/schedule-menu-labels.js";
import { schedulesView } from "../../../src/ui/views/schedules-view.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { bootMenu, defaultViews, type MenuDriver } from "../../support/tui/menu-driver.js";
import {
  FakeSchedulesPort,
  NOW,
  storedSchedule,
} from "../panels/schedules/fake-schedules-port.js";

const GIT = pkg("Git.Git", { name: "Git" });
const FIREFOX = pkg("Mozilla.Firefox");
const ALL_PLUGINS = pkg("all", { name: "Tous les plugins", aggregate: true });
const SCANS = [scan("nvim-lazy", [ALL_PLUGINS]), scan("winget", [GIT, FIREFOX])];

interface Options {
  readonly schedules?: readonly Schedule[];
  readonly isRegistered?: boolean;
  readonly launcher?: LauncherFactory;
  readonly onPlanification?: boolean;
}

async function menuWith(options: Options = {}) {
  const port = new FakeSchedulesPort();
  port.schedules = [...(options.schedules ?? [])];
  port.isRegistered = options.isRegistered ?? false;
  const menu = await bootMenu({
    scans: SCANS,
    views: [...defaultViews(), schedulesView(port)],
    size: { cols: 120, rows: 32 },
    ...(options.launcher && { launcher: options.launcher }),
    ...(options.onPlanification && { scanOnStart: false, initialView: "schedules" as const }),
  });
  await menu.waitForText(options.onPlanification ? "Planification" : "Mozilla.Firefox");
  return { port, menu };
}

/** Rows of Paquets after a scan of SCANS: nvim-lazy group, its row, winget group, Git, Firefox. */
async function check(menu: MenuDriver, ...rows: readonly number[]): Promise<void> {
  for (const row of rows) {
    await menu.press("HOME", ...Array.from({ length: row }, () => "down"), "space");
  }
}

async function ctrlS(menu: MenuDriver): Promise<void> {
  menu.screen.mockInput.pressKey("s", { ctrl: true });
  await menu.screen.flush();
}

/** The frame once it shows `text`: Escape reaches the menu after the terminal's escape delay. */
async function eventually(menu: MenuDriver, text: string): Promise<string> {
  let current = "";
  await vi.waitFor(async () => {
    current = await menu.frame();
    expect(current).toContain(text);
  });
  return current;
}

/** Let a flow's awaited port calls settle, then read the frame. */
async function settled(menu: MenuDriver): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return menu.frame();
}

describe("schedulesView in the menu", () => {
  it("sits after Paquets and counts the enabled schedules", async () => {
    const { menu } = await menuWith({
      schedules: [storedSchedule(), storedSchedule({ id: "0badf00d", enabled: false })],
    });
    const frame = await menu.frame();
    expect(frame).toMatch(/Paquets +3 +│[\s\S]*Planification +1 +│/);
    expect(frame).not.toContain("planif.");
  });

  it("flags a scheduled run that failed until the view is opened", async () => {
    const { port, menu } = await menuWith({ schedules: [storedSchedule()] });
    port.state = failedRun("a1b2c3d4");
    port.reload();
    await menu.press("down");
    const before = await menu.frame();
    expect(before).toMatch(/Planification +! +│/);
    expect(before).toContain("planif. : 1 exécution(s) · 1 échec");
    await menu.press("tab", "down", "enter");
    const after = await settled(menu);
    expect(port.seenMarks).toBe(1);
    expect(after).toMatch(/Planification +1 +│/);
    expect(after).not.toContain("planif.");
  });

  it("marks the packages an enabled schedule covers, whatever the case of their id", async () => {
    const { menu } = await menuWith({
      schedules: [
        storedSchedule({ targets: [{ providerId: "winget", packageId: "git.git" }] }),
        storedSchedule({
          id: "0badf00d",
          enabled: false,
          targets: [{ providerId: "winget", packageId: "Mozilla.Firefox" }],
        }),
      ],
    });
    const frame = await menu.frame();
    expect(frame).toMatch(/\[ \] ◷ Git /);
    expect(frame).toMatch(/\[ \] {3}Mozilla\.Firefox/);
  });
});

describe("p in Paquets", () => {
  it("asks for checked packages: the gesture never means a provider", async () => {
    const { menu, port } = await menuWith();
    await menu.press("p");
    expect(await menu.frame()).toContain(SCHEDULE_ACTION.emptyNotice);
    expect(port.calls).toEqual([]);
  });

  it("opens a new daily schedule of the checked packages, then registers after consent", async () => {
    const { menu, port } = await menuWith();
    await check(menu, 3, 4);
    await menu.press("p");
    const editor = await menu.waitForText("Nouvelle planification");
    expect(editor).toContain("[Git.Git +1]");
    expect(editor).toContain("[Chaque jour]");
    await ctrlS(menu);
    const consent = await menu.waitForText("Activer la planification");
    expect(consent).toContain("Planificateur de tâches Windows");
    await menu.press("enter");
    const saved = await settled(menu);
    expect(port.calls).toContain("create a1b2c3d4");
    expect(port.schedules[0]?.targets).toEqual([
      { providerId: "winget", packageId: "Git.Git", label: "Git" },
      { providerId: "winget", packageId: "Mozilla.Firefox" },
    ]);
    expect(saved).toContain("✔ Planification « Git.Git +1 » créée — chaque jour à 09:00");
    expect(saved).toContain("déclencheur système installé");
  });

  it("saves nothing when the consent is refused", async () => {
    const { menu, port } = await menuWith();
    await check(menu, 3);
    await menu.press("p");
    await menu.waitForText("Nouvelle planification");
    await ctrlS(menu);
    await menu.waitForText("Activer la planification");
    await menu.press("n");
    expect(await settled(menu)).toContain("Nouvelle planification");
    expect(port.calls).toEqual([]);
  });

  it("leaves a row that stands for a whole provider out, saying why", async () => {
    const { menu } = await menuWith();
    await check(menu, 1, 3);
    await menu.press("p");
    const editor = await menu.waitForText("Nouvelle planification");
    expect(editor).toContain("« Tous les plugins » représente tout le provider : non planifiable");
    expect(editor).toContain("Paquets (1)");
  });

  it("schedules nothing when every checked row stands for a provider", async () => {
    const { menu, port } = await menuWith();
    await check(menu, 1);
    await menu.press("p");
    expect(await menu.frame()).toContain("Aucun de ces paquets ne peut être planifié");
    await menu.press("enter");
    expect(await menu.frame()).toContain("┏━ Paquets");
    expect(port.calls).toEqual([]);
  });

  it("adds the checked packages to an existing schedule", async () => {
    const { menu, port } = await menuWith({ schedules: [storedSchedule()], isRegistered: true });
    await check(menu, 3, 4);
    await menu.press("p");
    const choice = await menu.waitForText("Planifier 2 paquet(s)");
    expect(choice).toContain("Ajouter à « Outils dev » (chaque jour à 09:00)");
    await menu.press("down", "enter");
    const done = await settled(menu);
    expect(port.calls).toEqual(["replace a1b2c3d4"]);
    expect(port.schedules[0]?.targets.map((target) => target.packageId)).toEqual([
      "Git.Git",
      "Mozilla.Firefox",
    ]);
    expect(done).toContain("1 paquet(s) ajouté(s) à « Outils dev »");
    expect(done).toContain("┏━ Planification");
  });
});

describe("the Planification list", () => {
  it("runs a schedule now through the menu's launcher and records its report", async () => {
    const launches: { packages: readonly SelectedPackage[]; request?: LaunchRequest }[] = [];
    const report = buildReport([{ key: "winget:Git.Git", providerId: "winget", outcome: outcome("Git.Git") }], []);
    const launcher: LauncherFactory = () => ({
      isRunning: false,
      launch: async (packages, request) => {
        launches.push({ packages, ...(request && { request }) });
        return report;
      },
    });
    const { menu, port } = await menuWith({ schedules: [storedSchedule()], launcher, onPlanification: true });
    port.preparation = withGitOutdated;
    await menu.press("x");
    expect(await menu.frame()).toContain("Exécuter « Outils dev » maintenant ?");
    await menu.press("enter");
    const done = await settled(menu);
    expect(launches).toEqual([
      {
        packages: [{ providerId: "winget", pkg: GIT }],
        request: { scheduleId: "a1b2c3d4", returnTo: "schedules" },
      },
    ]);
    expect(port.recorded.map((entry) => entry.report)).toEqual([report]);
    expect(done).toContain("Exécution terminée : ✔ 1 mis à jour");
  });

  it("records a run with nothing outdated without launching anything", async () => {
    const launch = vi.fn<() => Promise<UpdateReport | null>>(async () => null);
    const launcher: LauncherFactory = () => ({ isRunning: false, launch });
    const { menu, port } = await menuWith({ schedules: [storedSchedule()], launcher, onPlanification: true });
    await menu.press("x", "enter");
    expect(await settled(menu)).toContain("Exécution terminée : ✔ à jour");
    expect(launch).not.toHaveBeenCalled();
    expect(port.recorded.map((entry) => entry.report)).toEqual([null]);
  });

  it("leaves the record to the run tracker when the update leaves the screen", async () => {
    const { menu, port } = await menuWith({ schedules: [storedSchedule()], onPlanification: true });
    menu.setPreferences({ confirmBeforeUpdate: false });
    port.preparation = withGitOutdated;
    await menu.press("x", "enter");
    expect(await menu.exit).toMatchObject({ kind: "outside", returnTo: "schedules" });
    expect(port.recorded).toEqual([]);
  });

  it("starts no run while a scan of the menu runs, and says why", async () => {
    const port = new FakeSchedulesPort();
    port.schedules = [storedSchedule()];
    port.preparation = withGitOutdated;
    const launch = vi.fn<() => Promise<UpdateReport | null>>(async () => null);
    const menu = await bootMenu({
      views: [...defaultViews(), schedulesView(port)],
      size: { cols: 120, rows: 32 },
      initialView: "schedules",
      controller: { scan: () => new Promise<void>(() => {}) },
      launcher: () => ({ isRunning: false, launch }),
    });
    await menu.waitForText("Outils dev");
    await menu.press("x");
    const frame = await settled(menu);
    expect(frame).toContain(SCHEDULE_NOTICES.scanRunning);
    expect(frame).not.toContain("Exécuter « Outils dev » maintenant ?");
    expect(launch).not.toHaveBeenCalled();
    expect(port.recorded).toEqual([]);
  });

  it("deletes a schedule once confirmed, the answer defaulting to no", async () => {
    const { menu, port } = await menuWith({ schedules: [storedSchedule()], onPlanification: true });
    await menu.press("DELETE");
    expect(await menu.frame()).toContain("Supprimer « Outils dev » ?");
    await menu.press("enter");
    expect(port.calls).toEqual([]);
    await menu.press("d", "o");
    expect(await settled(menu)).toContain("Planification « Outils dev » supprimée");
    expect(port.calls).toEqual(["remove a1b2c3d4"]);
  });

  it("switches a schedule off, and on again after consenting to register the trigger", async () => {
    const { menu, port } = await menuWith({
      schedules: [storedSchedule()],
      isRegistered: true,
      onPlanification: true,
    });
    await menu.press("space");
    expect(await settled(menu)).toContain("déclencheur système retiré");
    await menu.press("space");
    expect(await menu.waitForText("Activer la planification")).toContain("Oui");
    await menu.press("enter");
    expect(await settled(menu)).toContain("Planification « Outils dev » activée — prochaine exécution demain 09:00");
    expect(port.calls).toEqual(["disable a1b2c3d4", "enable a1b2c3d4"]);
  });

  it("repairs the trigger with i, never with nothing enabled", async () => {
    const { menu, port } = await menuWith({
      schedules: [storedSchedule({ enabled: false })],
      onPlanification: true,
    });
    await menu.press("i");
    expect(await settled(menu)).toContain("Aucune planification active");
    port.schedules = [storedSchedule()];
    port.reload();
    await menu.press("i", "enter");
    expect(await settled(menu)).toContain("déclencheur système installé");
    expect(port.calls).toContain("repair");
  });
});

describe("the schedule editor", () => {
  async function editing() {
    const context = await menuWith({
      schedules: [storedSchedule()],
      isRegistered: true,
      onPlanification: true,
    });
    await context.menu.press("enter");
    await context.menu.waitForText("Modifier « Outils dev »");
    return context;
  }

  it("picks a weekly day, then types a monthly one", async () => {
    const { menu, port } = await editing();
    await menu.press("down", "enter");
    expect(await menu.frame()).toContain("Personnalisée (cron)");
    await menu.press("down", "enter", "down", "enter");
    expect(await menu.frame()).toContain("Jour de la semaine");
    await menu.press("down", "enter");
    expect(await menu.frame()).toContain("[mardi]");
    await menu.press("up", "enter", "down", "enter", "down", "enter");
    await new Promise((resolve) => setTimeout(resolve, 10));
    menu.screen.mockInput.pressBackspace();
    await menu.screen.mockInput.typeText("dernier");
    await menu.press("enter");
    expect(await menu.frame()).toContain("[dernier jour du mois]");
    await ctrlS(menu);
    await settled(menu);
    expect(port.schedules[0]?.recurrence).toEqual({ kind: "monthly", day: "last", at: { hour: 9, minute: 0 } });
  });

  it("adds a package typed as provider:paquet, refusing one that cannot be scheduled", async () => {
    const { menu, port } = await editing();
    await menu.press("END", "up", "up", "enter");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await menu.screen.mockInput.typeText("choco:vlc");
    await menu.press("enter");
    expect(await menu.frame()).toContain("« Chocolatey » demande sudo/admin");
    for (let i = 0; i < "choco:vlc".length; i++) menu.screen.mockInput.pressBackspace();
    await menu.screen.mockInput.typeText("npm-g:pnpm");
    await menu.press("enter");
    expect(await menu.frame()).toContain("Paquets (2)");
    await ctrlS(menu);
    expect(await settled(menu)).toContain("✔ Planification « Outils dev » enregistrée");
    expect(port.calls).toEqual(["replace a1b2c3d4"]);
  });

  it("refuses to save while a field has a problem", async () => {
    const { menu, port } = await editing();
    await menu.press("down", "down", "enter", "BACKSPACE", "BACKSPACE", "9", "9", "enter");
    expect(await menu.frame()).toContain("✖ heure invalide (HH:MM attendu)");
    await ctrlS(menu);
    expect(await settled(menu)).toContain("Corrigez les champs signalés avant d'enregistrer.");
    expect(port.calls).toEqual([]);
  });

  it("asks before dropping changes", async () => {
    const { menu } = await editing();
    await menu.press("enter", "x", "enter", "escape");
    await eventually(menu, "Abandonner les modifications ?");
    await menu.press("n");
    expect(await settled(menu)).toContain("[Outils devx]");
    await menu.press("escape");
    await eventually(menu, "Abandonner les modifications ?");
    await menu.press("o");
    expect(await eventually(menu, "┏━ Planification")).not.toContain("Abandonner");
  });
});

/** A last run that failed, finished before NOW and never seen. */
function failedRun(id: string): SchedulerState {
  const finishedAt = new Date(NOW.getTime() - 3_600_000).toISOString();
  const record = {
    kind: "on-time" as const,
    status: "failed" as const,
    startedAt: finishedAt,
    finishedAt,
    targets: [{ target: "winget:Git.Git", status: "failed" as const, message: "1603" }],
  };
  return { v: 1, schedules: { [id]: { lastRun: record } } };
}

/** The targeted scan found Git.Git outdated. */
function withGitOutdated(schedule: Schedule): PreparedRun {
  const update = { providerId: "winget", pkg: GIT, targets: ["winget:Git.Git"], scheduleIds: [schedule.id] };
  return {
    schedule,
    startedAt: NOW,
    plan: { updates: [update], resolved: new Map(), isEnvironmentDown: false },
  };
}
