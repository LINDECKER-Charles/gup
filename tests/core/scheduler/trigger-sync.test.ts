import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InstallRecordStore,
  type InstallRecord,
} from "../../../src/core/scheduler/persistence/install-record.js";
import { TICK_COMMAND, type TaskCommand } from "../../../src/core/scheduler/trigger/task-command.js";
import {
  TriggerSync,
  type CurrentRegistration,
  type TriggerSyncDeps,
} from "../../../src/core/scheduler/trigger/trigger-sync.js";
import { FakeTrigger } from "./fake-trigger.js";

const THIS_GUP = "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js";
const OTHER_GUP = "/home/a/.nvm/versions/node/v26.9.0/lib/node_modules/@charles_lindecker/gup/dist/cli.js";

const command = (node = "/usr/bin/node", entry = THIS_GUP): TaskCommand => ({
  node,
  entry,
  args: [TICK_COMMAND],
});

let dir: string;
let records: InstallRecordStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-sync-"));
  records = new InstallRecordStore(join(dir, "install.json"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function sync(
  trigger: FakeTrigger,
  options: { current?: CurrentRegistration | { error: string }; existing?: readonly string[] } = {},
): TriggerSync {
  const existing = new Set(options.existing ?? ["/usr/bin/node", THIS_GUP]);
  const deps: TriggerSyncDeps = {
    trigger,
    records,
    current: () => options.current ?? { command: command(), env: { PATH: "/usr/bin" } },
    probe: {
      exists: (path) => existing.has(path),
      packageRoot: (entry) => entry.replace(/\/dist\/cli\.js$/, ""),
    },
    clock: () => new Date("2026-10-03T08:00:00Z"),
    gupVersion: "0.5.0",
    platform: "linux",
  };
  return new TriggerSync(deps);
}

function recorded(overrides: Partial<InstallRecord> = {}): InstallRecord {
  return {
    v: 1,
    platform: "linux",
    mechanism: "crontab",
    launcher: "headless",
    argv: ["/usr/bin/node", THIS_GUP, TICK_COMMAND],
    env: {},
    installedAt: "2026-10-01T08:00:00.000Z",
    gupVersion: "0.5.0",
    ...overrides,
  };
}

describe("TriggerSync.reconcile", () => {
  it("registers the first time a schedule is enabled, and records what it registered", async () => {
    const trigger = new FakeTrigger();
    expect(await sync(trigger).reconcile(1)).toEqual({ kind: "installed" });
    expect(trigger.installed).toEqual({ command: command(), launcher: "headless" });
    expect(records.read()).toEqual({
      ...recorded({ env: { PATH: "/usr/bin" } }),
      installedAt: "2026-10-03T08:00:00.000Z",
    });
  });

  it("leaves a matching, present registration alone", async () => {
    const trigger = new FakeTrigger();
    trigger.installed = { command: command(), launcher: "headless" };
    records.write(recorded());
    expect(await sync(trigger).reconcile(2)).toEqual({ kind: "unchanged" });
    expect(trigger.calls).toEqual([]);
  });

  it("re-registers when the OS lost the trigger, keeping the recorded launcher", async () => {
    const trigger = new FakeTrigger();
    records.write(recorded({ launcher: "direct" }));
    expect(await sync(trigger).reconcile(1)).toEqual({ kind: "installed" });
    expect(trigger.installed?.launcher).toBe("direct");
  });

  it("removes the trigger and its record once nothing is enabled", async () => {
    const trigger = new FakeTrigger();
    trigger.installed = { command: command(), launcher: "headless" };
    records.write(recorded());
    expect(await sync(trigger).reconcile(0)).toEqual({ kind: "removed" });
    expect(trigger.installed).toBeNull();
    expect(records.read()).toBeNull();
    expect(await sync(new FakeTrigger()).reconcile(0)).toEqual({ kind: "unchanged" });
  });

  it("reports why this gup cannot be registered", async () => {
    const result = await sync(new FakeTrigger(), { current: { error: "gup doit être installé globalement" } }).reconcile(1);
    expect(result).toEqual({ kind: "failed", reason: "gup doit être installé globalement" });
  });

  it("keeps a working registration when this gup cannot register itself (npx)", async () => {
    const trigger = new FakeTrigger();
    trigger.installed = { command: command(), launcher: "headless" };
    records.write(recorded());
    const npx = sync(trigger, { current: { error: "gup doit être installé globalement" } });
    expect(await npx.reconcile(2)).toEqual({ kind: "unchanged" });
    trigger.installed = null;
    expect(await npx.reconcile(2)).toEqual({
      kind: "failed",
      reason: "gup doit être installé globalement",
    });
  });

  it("turns an OS failure into a failed result", async () => {
    const trigger = new FakeTrigger();
    trigger.failure = "Accès refusé";
    expect(await sync(trigger).reconcile(1)).toEqual({ kind: "failed", reason: "Accès refusé" });
    expect(records.read()).toBeNull();
  });
});

describe("TriggerSync.heal", () => {
  it("never registers for a user who never scheduled anything", async () => {
    const trigger = new FakeTrigger();
    expect(await sync(trigger).heal(3)).toEqual({ kind: "unchanged" });
    expect(trigger.calls).toEqual([]);
  });

  it("repairs a registration whose node or gup disappeared (Node upgrade)", async () => {
    const trigger = new FakeTrigger();
    records.write(recorded({ argv: ["/usr/bin/node-old", "/gone/gup/dist/cli.js", TICK_COMMAND] }));
    expect(await sync(trigger).heal(1)).toEqual({ kind: "installed" });
    expect(trigger.installed?.command).toEqual(command());
  });

  it("repairs a registration of the same package under another node", async () => {
    const trigger = new FakeTrigger();
    records.write(recorded({ argv: ["/opt/node20/bin/node", THIS_GUP, TICK_COMMAND] }));
    const healer = sync(trigger, { existing: ["/usr/bin/node", "/opt/node20/bin/node", THIS_GUP] });
    expect(await healer.heal(1)).toEqual({ kind: "installed" });
  });

  it("leaves another existing gup installation's registration alone (S-3)", async () => {
    const trigger = new FakeTrigger();
    trigger.installed = { command: command("/opt/node/bin/node", OTHER_GUP), launcher: "headless" };
    records.write(recorded({ argv: ["/opt/node/bin/node", OTHER_GUP, TICK_COMMAND] }));
    const healer = sync(trigger, { existing: ["/usr/bin/node", THIS_GUP, "/opt/node/bin/node", OTHER_GUP] });
    expect(await healer.heal(1)).toEqual({ kind: "foreign", entry: OTHER_GUP });
    expect(await healer.reconcile(1)).toEqual({ kind: "foreign", entry: OTHER_GUP });
    expect(trigger.calls).toEqual([]);
  });

  it("removes a registration left behind once nothing is enabled", async () => {
    const trigger = new FakeTrigger();
    trigger.installed = { command: command(), launcher: "headless" };
    records.write(recorded());
    expect(await sync(trigger).heal(0)).toEqual({ kind: "removed" });
  });
});

describe("TriggerSync.reinstall", () => {
  it("takes the trigger over from another installation, with the requested launcher", async () => {
    const trigger = new FakeTrigger();
    records.write(recorded({ argv: ["/opt/node/bin/node", OTHER_GUP, TICK_COMMAND] }));
    const syncer = sync(trigger, { existing: ["/usr/bin/node", THIS_GUP, "/opt/node/bin/node", OTHER_GUP] });
    expect(await syncer.reinstall("direct")).toEqual({ kind: "installed" });
    expect(records.read()).toMatchObject({ argv: ["/usr/bin/node", THIS_GUP, TICK_COMMAND], launcher: "direct" });
  });
});

describe("InstallRecordStore", () => {
  it("reads a malformed or foreign record as absent", async () => {
    const file = join(dir, "install.json");
    for (const content of ["{", "[]", JSON.stringify({ ...recorded(), v: 2 }), JSON.stringify({ ...recorded(), argv: [1, 2] })]) {
      await writeFile(file, content);
      expect(new InstallRecordStore(file).read()).toBeNull();
    }
  });

  it("drops non-string environment values", async () => {
    const file = join(dir, "install.json");
    await writeFile(file, JSON.stringify({ ...recorded(), env: { PATH: "/bin", X: 1 } }));
    expect(new InstallRecordStore(file).read()?.env).toEqual({ PATH: "/bin" });
  });
});
