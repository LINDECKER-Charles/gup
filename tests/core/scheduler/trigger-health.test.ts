import { describe, expect, it } from "vitest";
import type { InstallRecord } from "../../../src/core/scheduler/persistence/install-record.js";
import {
  assessTrigger,
  type HealthFacts,
} from "../../../src/core/scheduler/trigger/trigger-health.js";

const NOW = new Date("2026-10-05T10:00:00Z");
const record: InstallRecord = {
  v: 1,
  platform: "win32",
  mechanism: "windows-task",
  launcher: "headless",
  argv: ["C:\\node.exe", "C:\\gup\\dist\\cli.js", "__schedule-tick"],
  env: {},
  installedAt: "2026-10-01T08:00:00.000Z",
  gupVersion: "0.5.0",
};

function facts(overrides: Partial<HealthFacts> = {}): HealthFacts {
  return {
    enabledCount: 1,
    record,
    status: { isInstalled: true, isDisabledByUser: false },
    match: "same",
    lastTickAt: "2026-10-05T09:56:00.000Z",
    now: NOW,
    uptimeSeconds: 86_400,
    ...overrides,
  };
}

describe("assessTrigger", () => {
  it("is active with a fresh heartbeat", () => {
    expect(assessTrigger(facts())).toEqual({
      kind: "active",
      lastTickAt: new Date("2026-10-05T09:56:00Z"),
    });
  });

  it("says nothing is needed without an enabled schedule", () => {
    expect(assessTrigger(facts({ enabledCount: 0 }))).toEqual({ kind: "none" });
  });

  it("reports a missing registration, from gup's record or from the OS", () => {
    expect(assessTrigger(facts({ record: null }))).toEqual({ kind: "not-installed" });
    const gone = { isInstalled: false, isDisabledByUser: false };
    expect(assessTrigger(facts({ status: gone }))).toEqual({ kind: "not-installed" });
  });

  it("reports a trigger switched off, another installation's, or an outdated path", () => {
    const off = { isInstalled: true, isDisabledByUser: true };
    expect(assessTrigger(facts({ status: off }))).toEqual({ kind: "disabled-by-user" });
    expect(assessTrigger(facts({ match: "foreign" }))).toEqual({
      kind: "foreign",
      entry: "C:\\gup\\dist\\cli.js",
    });
    expect(assessTrigger(facts({ match: "drift" }))).toEqual({ kind: "outdated" });
  });

  it("calls a trigger silent for three intervals stale, unless the machine just booted", () => {
    const late = { lastTickAt: "2026-10-05T09:14:00.000Z" };
    expect(assessTrigger(facts(late))).toEqual({
      kind: "stale",
      since: new Date("2026-10-05T09:14:00Z"),
    });
    expect(assessTrigger(facts({ ...late, uptimeSeconds: 600 }))).toMatchObject({ kind: "active" });
  });

  it("measures silence from the installation when no tick ever ran", () => {
    expect(assessTrigger(facts({ lastTickAt: undefined }))).toMatchObject({ kind: "stale" });
    const fresh = { ...record, installedAt: "2026-10-05T09:50:00.000Z" };
    expect(assessTrigger(facts({ lastTickAt: undefined, record: fresh }))).toEqual({
      kind: "active",
      lastTickAt: null,
    });
  });
});
