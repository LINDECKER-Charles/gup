import { afterEach, describe, expect, it } from "vitest";
import { installLogBackend, type LogInput, type LogLevel } from "../../../src/core/log/log.js";
import { createUpdateLogObserver } from "../../../src/core/log/update-log-observer.js";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";

afterEach(() => {
  installLogBackend(null);
});

function recordAll(): { level: LogLevel; event: string; data: LogInput | undefined }[] {
  const emitted: { level: LogLevel; event: string; data: LogInput | undefined }[] = [];
  installLogBackend({ isEnabled: () => true, emit: (level, event, data) => void emitted.push({ level, event, data }) });
  return emitted;
}

function planned(packageId: string, over: Partial<PlannedUpdate> = {}): PlannedUpdate {
  return {
    providerId: "npm-g",
    packageId,
    key: `npm-g:${packageId}`,
    providerName: "npm (global)",
    pkg: { id: packageId, current: "1.0.0", latest: "2.0.0" },
    ...over,
  };
}

describe("createUpdateLogObserver", () => {
  it("records a run from plan to outcomes, failures at warn", () => {
    const emitted = recordAll();
    const observer = createUpdateLogObserver();
    const ok = planned("typescript", { scheduleId: "s1" });
    const ko = planned("eslint");
    observer.planned({ direct: [ok, ko], elevated: [] });
    observer.started({ item: ok });
    observer.finished({ item: ok, outcome: { id: "typescript", success: true }, durationMs: 1200 });
    observer.started({ item: ko, retry: "force" });
    observer.finished({ item: ko, outcome: { id: "eslint", success: false, message: "EPERM" }, durationMs: 300, retry: "force" });
    expect(emitted).toEqual([
      { level: "info", event: "update.planned", data: { direct: 2, elevated: 0 } },
      {
        level: "info",
        event: "update.start",
        data: { providerId: "npm-g", packageId: "typescript", from: "1.0.0", to: "2.0.0", scheduleId: "s1" },
      },
      {
        level: "info",
        event: "update.end",
        data: {
          providerId: "npm-g",
          packageId: "typescript",
          from: "1.0.0",
          to: "2.0.0",
          scheduleId: "s1",
          status: "success",
          ms: 1200,
        },
      },
      {
        level: "info",
        event: "update.start",
        data: { providerId: "npm-g", packageId: "eslint", from: "1.0.0", to: "2.0.0", retry: "force" },
      },
      {
        level: "warn",
        event: "update.end",
        data: {
          providerId: "npm-g",
          packageId: "eslint",
          from: "1.0.0",
          to: "2.0.0",
          retry: "force",
          status: "failed",
          ms: 300,
          message: "EPERM",
        },
      },
    ]);
  });

  it("keeps a skipped package at info, and records the elevated batch, cancellations and waits", () => {
    const emitted = recordAll();
    const observer = createUpdateLogObserver();
    const item: PlannedUpdate = { providerId: "choco", packageId: "git", key: "choco:git", providerName: "Chocolatey" };
    observer.finished({ item, outcome: { id: "git", success: false, skipped: true } });
    observer.elevationStarted([item]);
    observer.cancelled([item, planned("x")]);
    observer.waiting({ kind: "scheduled", pid: 99, startedAt: "2026-10-03T12:00:00.000Z" });
    expect(emitted).toEqual([
      { level: "info", event: "update.end", data: { providerId: "choco", packageId: "git", status: "skipped" } },
      { level: "info", event: "elevation.batch", data: { count: 1, packages: ["choco:git"] } },
      { level: "info", event: "update.cancelled", data: { count: 2, packages: ["choco:git", "npm-g:x"] } },
      { level: "info", event: "update.waiting", data: { kind: "scheduled", pid: 99, since: "2026-10-03T12:00:00.000Z" } },
    ]);
  });
});
