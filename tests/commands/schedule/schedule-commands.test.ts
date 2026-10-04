import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCommand,
  disableCommand,
  enableCommand,
  removeCommand,
} from "../../../src/commands/schedule/crud-commands.js";
import { listSchedulesCommand, statusCommand } from "../../../src/commands/schedule/report-commands.js";
import { runNowCommand } from "../../../src/commands/schedule/run-now.js";
import type { AddOptions } from "../../../src/commands/schedule/schedule-args.js";
import { REGISTRY_PROVIDER_FACTS } from "../../../src/commands/schedule/scheduler-services.js";
import {
  installCommand,
  uninstallCommand,
} from "../../../src/commands/schedule/trigger-commands.js";
import type { UpdateRequest } from "../../../src/core/update/update-ports.js";
import { buildReport } from "../../../src/core/update/update-report.js";
import {
  notAPackage,
  SCHEDULE_CLI_LABELS,
} from "../../../src/ui/text/schedule/schedule-cli-labels.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { useLocale } from "../../support/locale.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";
import { schedulerFixture, type Fixture, type FixtureOptions } from "./scheduler-fixture.js";

let fixture: Fixture;

afterEach(async () => {
  restorePlatform();
  await fixture?.cleanup();
});

async function setup(options: FixtureOptions = {}): Promise<Fixture> {
  fixture = await schedulerFixture(options);
  return fixture;
}

function add(overrides: Partial<AddOptions> = {}): AddOptions {
  return {
    targets: ["winget:Git.Git", "npm-g:typescript"],
    every: "weekly",
    on: "lun",
    name: "Outils dev",
    catchUp: true,
    disabled: false,
    ...overrides,
  };
}

/** A cron schedule: `add()` without its weekly preset. */
function addCron(cron: string, overrides: Partial<AddOptions> = {}): AddOptions {
  const { every: _every, on: _on, ...base } = add(overrides);
  return { ...base, cron };
}

function firstId(fixtureServices: Fixture["services"]): string {
  return fixtureServices.repo.list()[0]!.id;
}

const INSTALLED = "  déclencheur système installé (crontab de votre utilisateur · vérification toutes les 15 min)";

describe("gup schedule add", () => {
  it("saves the schedule, previews it, and registers the trigger the first time", async () => {
    const { services, output, trigger } = await setup();
    expect(await addCommand(services, add(), output)).toBe(0);
    expect(output.lines).toEqual([
      expect.stringMatching(/^√ Planification [0-9a-f]{8} « Outils dev » créée — chaque lundi à 09:00$/),
      "  prochaines exécutions : lun. 5 oct. 09:00 · lun. 12 oct. 09:00 · lun. 19 oct. 09:00",
      `  ${SCHEDULE_CLI_LABELS.wingetUacNote}`,
      INSTALLED,
    ]);
    expect(trigger.installed?.launcher).toBe("headless");
    expect(services.installs.read()?.argv[1]).toContain("gup/dist/cli.js");
    expect(services.repo.list()).toHaveLength(1);
  });

  it("creates a disabled schedule without any trigger, telling how to enable it", async () => {
    const { services, output, trigger } = await setup();
    expect(await addCommand(services, add({ disabled: true }), output)).toBe(0);
    const id = firstId(services);
    expect(output.lines.slice(0, 2)).toEqual([
      `√ Planification ${id} « Outils dev » créée — chaque lundi à 09:00 (désactivée)`,
      `  désactivée — « gup schedule enable ${id} » pour l'activer`,
    ]);
    expect(trigger.calls).toEqual([]);
  });

  it("does not register again for the second schedule", async () => {
    const { services, output, trigger } = await setup();
    await addCommand(services, add(), output);
    await addCommand(services, add({ targets: ["npm-g:eslint"], name: "Lint" }), output);
    expect(trigger.calls).toEqual(["install"]);
  });

  it("refuses a whole provider, with an example (exit 2, nothing saved)", async () => {
    const { services, output } = await setup();
    expect(await addCommand(services, add({ targets: ["winget"] }), output)).toBe(2);
    expect(output.errors).toEqual([notAPackage()]);
    expect(services.repo.list()).toEqual([]);
  });

  it("refuses a provider foreign to this OS with the registry's reason (exit 2, nothing saved)", async () => {
    const { services, output } = await setup();
    setPlatform("win32");
    const registry = { ...services, providers: REGISTRY_PROVIDER_FACTS };
    expect(await addCommand(registry, add({ targets: ["brew:git"] }), output)).toBe(2);
    expect(output.errors).toEqual([
      "× brew:git : Provider brew indisponible sur Windows (macOS/Linux uniquement)",
    ]);
    expect(services.repo.list()).toEqual([]);
  });

  it("refuses providers that always need an administrator and too-frequent expressions", async () => {
    const { services, output } = await setup();
    const options = addCron("*/10 * * * *", { targets: ["choco:vlc"] });
    expect(await addCommand(services, options, output)).toBe(2);
    expect(output.errors).toEqual([
      "× fréquence : Fréquence trop élevée — au plus une exécution par heure",
      "× choco:vlc : « Chocolatey » demande sudo/admin à chaque mise à jour : non planifiable",
    ]);
  });

  it("keeps the schedule and exits 1 with the retry command when the trigger fails", async () => {
    const { services, output, trigger } = await setup();
    trigger.failure = "Accès refusé";
    expect(await addCommand(services, add(), output)).toBe(1);
    expect(services.repo.list()).toHaveLength(1);
    expect(output.errors).toEqual([
      "  ‼ Le déclencheur système n'a pas pu être modifié : Accès refusé",
      "    Réessayez : gup schedule install",
    ]);
  });

  it("says why where the platform has no trigger", async () => {
    const { services, output } = await setup({ isUnsupported: true });
    expect(await addCommand(services, add(), output)).toBe(1);
    expect(output.errors[0]).toContain("planification non prise en charge sous freebsd");
  });

  it("warns that the OS trigger will not see GUP_SCHEDULER_DIR", async () => {
    const { services, output } = await setup({ isDirOverridden: true });
    await addCommand(services, add(), output);
    expect(output.errors).toEqual([`  ${SCHEDULE_CLI_LABELS.schedulerDirOverridden}`]);
  });
});

describe("gup schedule remove / enable / disable", () => {
  it("removes the trigger with the last enabled schedule, and brings it back on enable", async () => {
    const { services, output, trigger } = await setup();
    await addCommand(services, add(), output);
    const id = firstId(services);
    output.lines.length = 0;
    expect(await disableCommand(services, [id.slice(0, 4)], output)).toBe(0);
    expect(output.lines).toEqual([
      `Planification désactivée : ${id} « Outils dev »`,
      `  ${SCHEDULE_CLI_LABELS.triggerRemoved}`,
    ]);
    expect(trigger.installed).toBeNull();
    output.lines.length = 0;
    expect(await enableCommand(services, [id], output)).toBe(0);
    expect(output.lines).toEqual([
      `Planification activée : ${id} « Outils dev » — prochaine exécution lun. 5 oct. 09:00`,
      INSTALLED,
    ]);
    expect(await removeCommand(services, [id], output)).toBe(0);
    expect(services.repo.list()).toEqual([]);
    expect(trigger.installed).toBeNull();
  });

  it("changes nothing when one id is unknown (exit 2)", async () => {
    const { services, output } = await setup();
    await addCommand(services, add(), output);
    const id = firstId(services);
    expect(await removeCommand(services, [id, "deadbeef"], output)).toBe(2);
    expect(output.errors).toEqual(["Aucune planification « deadbeef »"]);
    expect(services.repo.list()).toHaveLength(1);
  });
});

describe("gup schedule list", () => {
  it("explains how to start when there is nothing", async () => {
    const { services, output } = await setup();
    expect(await listSchedulesCommand(services, { json: false }, output)).toBe(0);
    expect(output.lines).toEqual([SCHEDULE_CLI_LABELS.noSchedule]);
  });

  it("shows the trigger, then one aligned row per schedule", async () => {
    const { services, output } = await setup();
    await addCommand(services, add(), output);
    const python = addCron("0 */6 * * *", { name: "Python", targets: ["npm-g:x"], disabled: true });
    await addCommand(services, python, output);
    output.lines.length = 0;
    await listSchedulesCommand(services, { json: false }, output);
    const ids = services.repo.list().map((schedule) => schedule.id);
    expect(output.lines).toEqual([
      "Déclencheur : actif · crontab de votre utilisateur · aucun passage encore",
      "ID        ÉTAT  NOM         FRÉQUENCE             PAQUETS  PROCHAINE          DERNIÈRE",
      `${ids[0]}  ●     Outils dev  chaque lundi à 09:00        2  lun. 5 oct. 09:00  —`,
      `${ids[1]}  ○     Python      cron : 0 */6 * * *          1  désactivée         —`,
    ]);
  });

  it("prints a stable JSON shape for scripts", async () => {
    const { services, output } = await setup();
    await addCommand(services, add(), output);
    output.lines.length = 0;
    await listSchedulesCommand(services, { json: true }, output);
    const [schedule] = services.repo.list();
    expect(JSON.parse(output.lines.join("\n"))).toEqual({
      trigger: { installed: true, mechanism: "crontab", health: "active", lastTickAt: null },
      schedules: [
        {
          id: schedule?.id,
          name: "Outils dev",
          enabled: true,
          recurrence: { kind: "weekly", weekday: 1, at: { hour: 9, minute: 0 } },
          cron: "0 9 * * 1",
          targets: ["winget:Git.Git", "npm-g:typescript"],
          options: { catchUp: true },
          nextRuns: ["2026-10-05T09:00:00.000Z", "2026-10-12T09:00:00.000Z", "2026-10-19T09:00:00.000Z"],
          lastRun: null,
        },
      ],
    });
  });
});

describe("gup schedule status", () => {
  it("describes the registration", async () => {
    const { services, output } = await setup();
    await addCommand(services, add(), output);
    output.lines.length = 0;
    expect(await statusCommand(services, { json: false }, output)).toBe(0);
    expect(output.lines).toEqual([
      "Déclencheur : actif · crontab de votre utilisateur · aucun passage encore",
      "  emplacement : gup-scheduler-test",
      `  commande : "/usr/bin/node" "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js" "__schedule-tick" (lanceur : headless)`,
      "  installé le : 03/10 10:00 · gup 0.5.0",
      "  planifications actives : 1",
    ]);
  });

  it("prints JSON, and says when nothing is registered", async () => {
    const { services, output } = await setup();
    await statusCommand(services, { json: true }, output);
    expect(JSON.parse(output.lines.join("\n"))).toMatchObject({
      installed: false,
      health: "none",
      mechanism: "crontab",
      argv: null,
      enabledCount: 0,
    });
  });
});

describe("gup schedule install / uninstall", () => {
  it("refuses to install without an enabled schedule, and refuses an unknown launcher", async () => {
    const { services, output } = await setup();
    expect(await installCommand(services, {}, output)).toBe(1);
    expect(output.errors).toEqual([SCHEDULE_CLI_LABELS.nothingToInstall]);
    expect(await installCommand(services, { launcher: "hidden" }, output)).toBe(2);
  });

  it("reinstalls with the requested launcher", async () => {
    const { services, output, trigger } = await setup();
    await addCommand(services, add(), output);
    expect(await installCommand(services, { launcher: "direct" }, output)).toBe(0);
    expect(trigger.installed?.launcher).toBe("direct");
    expect(services.installs.read()?.launcher).toBe("direct");
  });

  it("removes the trigger and disables every schedule", async () => {
    const { services, output, trigger } = await setup();
    await addCommand(services, add(), output);
    output.lines.length = 0;
    expect(await uninstallCommand(services, { purge: false }, output)).toBe(0);
    expect(output.lines).toEqual([
      "Déclencheur supprimé. 1 planification(s) désactivée(s) — « gup schedule enable <id> » pour réactiver.",
    ]);
    expect(trigger.installed).toBeNull();
    expect(services.repo.list()[0]?.enabled).toBe(false);
    expect(services.installs.read()).toBeNull();
  });

  it("deletes every scheduler file with --purge", async () => {
    const { services, output } = await setup();
    await addCommand(services, add(), output);
    expect(await uninstallCommand(services, { purge: true }, output)).toBe(0);
    expect(output.lines.at(-1)).toBe(SCHEDULE_CLI_LABELS.purged);
    expect(existsSync(services.files.schedules)).toBe(false);
    expect(existsSync(services.files.install)).toBe(false);
  });

  it("keeps everything when the trigger cannot be removed", async () => {
    const { services, output, trigger } = await setup();
    await addCommand(services, add(), output);
    trigger.failure = "Accès refusé";
    expect(await uninstallCommand(services, { purge: true }, output)).toBe(1);
    expect(output.errors.at(-1)).toBe("  Réessayez : gup schedule uninstall");
    expect(existsSync(services.files.schedules)).toBe(true);
  });
});

describe("gup schedule run-now", () => {
  const outdated = {
    results: [scan("winget", [pkg("Git.Git", { current: "2.46.0", latest: "2.47.0" })]), scan("npm-g")],
    available: new Set(["winget", "npm-g"]),
  };

  it("scans the schedule's providers, updates on the terminal, records the run", async () => {
    const { services, output, scanned } = await setup({ scan: outdated });
    await addCommand(services, add(), output);
    const id = firstId(services);
    output.lines.length = 0;
    const requests: UpdateRequest[] = [];
    const code = await runNowCommand(
      services,
      {
        id,
        execute: async (batch) => {
          requests.push(...batch);
          return buildReport([{ key: "winget:Git.Git", providerId: "winget", outcome: outcome("Git.Git") }], []);
        },
      },
      output,
    );
    expect(code).toBe(0);
    expect(scanned).toEqual([["winget", "npm-g"]]);
    expect(requests.map((r) => [r.providerId, r.packageId, r.scheduleId])).toEqual([["winget", "Git.Git", id]]);
    expect(output.lines).toEqual([
      `Exécution de ${id} « Outils dev » — scan : Winget, npm (global)…`,
      "Résultat : √ 1 mis à jour",
      "  Winget  Git.Git  2.46.0 → 2.47.0",
      "  npm (global)  typescript  aucune mise à jour",
    ]);
    expect(services.state.read().schedules[id]?.lastRun).toMatchObject({ kind: "manual", status: "success" });
  });

  it("exits 1 when an update failed, 2 for an unknown id", async () => {
    const { services, output } = await setup({ scan: outdated });
    await addCommand(services, add(), output);
    const id = firstId(services);
    const failing = async () =>
      buildReport([{ key: "winget:Git.Git", providerId: "winget", outcome: outcome("Git.Git", { success: false, message: "1603" }) }], []);
    expect(await runNowCommand(services, { id, execute: failing }, output)).toBe(1);
    expect(await runNowCommand(services, { id: "cafe" }, output)).toBe(2);
  });
});

describe("gup schedule in English", () => {
  useLocale("en");

  it("says what it saved, when it runs, and what the trigger did", async () => {
    const { services, output } = await setup();
    expect(await addCommand(services, add({ on: "mon", name: "Dev tools" }), output)).toBe(0);
    expect(output.lines).toEqual([
      expect.stringMatching(/^√ Schedule [0-9a-f]{8} "Dev tools" created — every Monday at 09:00$/),
      "  next runs: Mon, Oct 5 09:00 · Mon, Oct 12 09:00 · Mon, Oct 19 09:00",
      "  note: a winget package installed for all users may ask for UAC — it will then be " +
        "skipped (an unattended run never elevates)",
      "  OS trigger installed (your user's crontab · checks every 15 min)",
    ]);
  });

  it("lists the schedules under English headers", async () => {
    const { services, output } = await setup();
    await addCommand(services, add({ name: "Dev tools" }), output);
    output.lines.length = 0;
    await listSchedulesCommand(services, { json: false }, output);
    expect(output.lines).toEqual([
      "Trigger: active · your user's crontab · no check yet",
      "ID        STATE  NAME       FREQUENCY              PACKAGES  NEXT              LAST",
      `${firstId(services)}  ●      Dev tools  every Monday at 09:00         2  Mon, Oct 5 09:00  —`,
    ]);
  });

  it("refuses an unknown id in English", async () => {
    const { services, output } = await setup();
    expect(await removeCommand(services, ["deadbeef"], output)).toBe(2);
    expect(output.errors).toEqual(['No schedule "deadbeef"']);
  });
});
