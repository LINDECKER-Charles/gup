import { describe, expect, it } from "vitest";
import { DEFAULT_INSTALL_TIMEOUT_S } from "../../../src/core/runner.js";
import {
  EXECUTION_TIME_LIMIT_MINUTES,
  MAX_RUN_MINUTES,
  SCHEDULED_INSTALL_CAP_S,
  scheduledInstallTimeout,
  TICK_WATCHDOG_MINUTES,
} from "../../../src/core/scheduler/scheduler-timing.js";

describe("scheduler time budget", () => {
  it("ends every run on its own before Windows would kill the task", () => {
    const worstRunSeconds = MAX_RUN_MINUTES * 60 + SCHEDULED_INSTALL_CAP_S;
    expect(worstRunSeconds).toBeLessThan(TICK_WATCHDOG_MINUTES * 60);
    expect(TICK_WATCHDOG_MINUTES).toBeLessThan(EXECUTION_TIME_LIMIT_MINUTES);
  });

  it("clamps the install timeout of scheduled runs", () => {
    expect(scheduledInstallTimeout(0)).toBe(DEFAULT_INSTALL_TIMEOUT_S);
    expect(scheduledInstallTimeout(600)).toBe(600);
    expect(scheduledInstallTimeout(86_400)).toBe(SCHEDULED_INSTALL_CAP_S);
    expect(scheduledInstallTimeout(5)).toBe(60);
  });
});
