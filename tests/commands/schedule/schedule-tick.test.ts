import { afterEach, describe, expect, it, vi } from "vitest";
import { runTick, type ScheduledTick, type TickRuntime } from "../../../src/commands/schedule/tick.js";
import {
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../../../src/core/runner.js";
import { SCHEDULED_INSTALL_CAP_S } from "../../../src/core/scheduler/scheduler-timing.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";
import { schedulerFixture, type Fixture } from "./scheduler-fixture.js";

let fixture: Fixture;
const initialTimeout = getInstallTimeoutSeconds();

afterEach(async () => {
  setInstallTimeoutSeconds(initialTimeout);
  await fixture?.cleanup();
});

interface Probe {
  readonly runtime: TickRuntime;
  readonly env: NodeJS.ProcessEnv;
  readonly run: ScheduledTick & { stops: number; ticks: number };
  readonly signal: { handler: (() => void) | null; unsubscribed: boolean };
  readonly dirs: string[];
}

async function probe(overrides: Partial<TickRuntime> = {}): Promise<Probe> {
  fixture = await schedulerFixture();
  const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
  const run = {
    stops: 0,
    ticks: 0,
    async tick() {
      run.ticks++;
      return { kind: "idle" };
    },
    stop() {
      run.stops++;
    },
  };
  const signal = { handler: null as (() => void) | null, unsubscribed: false };
  const dirs: string[] = [];
  const runtime: TickRuntime = {
    env,
    platform: "linux",
    uptimeSeconds: () => 3600,
    services: () => fixture.services,
    createRun: () => run,
    onStopSignal: (handler) => {
      signal.handler = handler;
      return () => void (signal.unsubscribed = true);
    },
    chdir: (dir) => void dirs.push(dir),
    exit: vi.fn(),
    ...overrides,
  };
  return { runtime, env, run, signal, dirs };
}

describe("runTick", () => {
  it("forbids prompts and runs one tick from the scheduler's directory", async () => {
    const { runtime, env, run, dirs, signal } = await probe();
    expect(await runTick(runtime)).toBe(0);
    expect(env["GUP_NONINTERACTIVE"]).toBe("1");
    expect(run.ticks).toBe(1);
    expect(dirs).toEqual([fixture.services.files.dir]);
    expect(signal.unsubscribed).toBe(true);
  });

  it("does nothing right after boot", async () => {
    const { runtime, run } = await probe({ uptimeSeconds: () => 120 });
    expect(await runTick(runtime)).toBe(0);
    expect(run.ticks).toBe(0);
  });

  it("applies the captured environment on macOS and Linux only", async () => {
    const linux = await probe();
    fixture.services.installs.write({
      v: 1,
      platform: "linux",
      mechanism: "crontab",
      launcher: "headless",
      argv: ["/usr/bin/node", "/gup/dist/cli.js", TICK_COMMAND],
      env: { PATH: "/home/a/.cargo/bin:/usr/bin", GITHUB_TOKEN: "never" },
      installedAt: "2026-10-01T08:00:00.000Z",
      gupVersion: "0.5.0",
    });
    await runTick(linux.runtime);
    expect(linux.env).toEqual({ PATH: "/home/a/.cargo/bin:/usr/bin", GUP_NONINTERACTIVE: "1" });
    const record = fixture.services.installs.read()!;
    await fixture.cleanup();
    const windows = await probe({ platform: "win32" });
    fixture.services.installs.write(record);
    await runTick(windows.runtime);
    expect(windows.env["PATH"]).toBe("/usr/bin");
  });

  it("clamps the install timeout of the run", async () => {
    const { runtime } = await probe();
    setInstallTimeoutSeconds(86_400);
    await runTick(runtime);
    expect(getInstallTimeoutSeconds()).toBe(SCHEDULED_INSTALL_CAP_S);
  });

  it("asks the run to stop on SIGTERM and kin", async () => {
    let stops = 0;
    const { runtime, signal } = await probe({
      createRun: () => ({
        async tick() {
          signal.handler?.();
          return { kind: "ran" };
        },
        stop: () => void stops++,
      }),
    });
    await runTick(runtime);
    expect(stops).toBe(1);
  });

  it("logs a crash and exits 1; a missing state dir exits 1 too", async () => {
    const crashing = await probe({
      createRun: () => ({
        tick: async () => {
          throw new Error("boom");
        },
        stop: () => {},
      }),
    });
    expect(await runTick(crashing.runtime)).toBe(1);
    await fixture.cleanup();
    const nowhere = await probe({ services: () => ({ error: "nowhere" }) });
    expect(await runTick(nowhere.runtime)).toBe(1);
  });
});
