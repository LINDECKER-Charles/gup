import { afterEach, describe, expect, it, vi } from "vitest";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * How a pseudo-terminal's tree is killed. `killProcessTree` (taskkill) and
 * `process.kill` are replaced: a unit test never kills anything real.
 */
const { killProcessTreeMock } = vi.hoisted(() => ({
  killProcessTreeMock: vi.fn(async (_pid: number) => {}),
}));
vi.mock("../../../src/core/runner.js", () => ({ killProcessTree: killProcessTreeMock }));

import { ptyKill } from "../../../src/core/pty/pty-kill.js";

const PENDING = Symbol("pending");

/** The value of a promise if it already settled, else PENDING. */
async function peek<T>(promise: Promise<T>): Promise<T | typeof PENDING> {
  const later = new Promise<typeof PENDING>((resolve) => setImmediate(() => resolve(PENDING)));
  return Promise.race([promise, later]);
}

const ESRCH = () => Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });

afterEach(() => {
  vi.useRealTimers();
  restorePlatform();
  vi.restoreAllMocks();
});

describe("ptyKill on Windows", () => {
  it("takes the whole tree down with taskkill, and is done once taskkill returned", async () => {
    setPlatform("win32");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);
    let taskkillReturned!: () => void;
    killProcessTreeMock.mockReturnValueOnce(new Promise<void>((done) => (taskkillReturned = done)));

    const gone = ptyKill.terminate(1234);
    expect(await peek(gone)).toBe(PENDING);
    taskkillReturned();
    await expect(gone).resolves.toBeUndefined();

    expect(killProcessTreeMock).toHaveBeenCalledExactlyOnceWith(1234);
    expect(signal).not.toHaveBeenCalled();
  });
});

describe("ptyKill on POSIX", () => {
  it("TERMs the trampoline's group and is done as soon as nothing of it is left", async () => {
    setPlatform("darwin");
    const signal = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === 0) throw ESRCH();
      return true;
    });

    await ptyKill.terminate(1234);

    expect(signal.mock.calls).toEqual([
      [-1234, "SIGTERM"],
      [-1234, 0],
    ]);
    expect(killProcessTreeMock).not.toHaveBeenCalled();
  });

  // The trampoline dies on SIGTERM at once; npm under it may be waiting on a
  // download that never ends, and only rolls back once that action returns.
  it("KILLs the group when anything of it outlives the grace period", async () => {
    vi.useFakeTimers();
    setPlatform("linux");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);

    const gone = ptyKill.terminate(1234);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(signal).not.toHaveBeenCalledWith(-1234, "SIGKILL");

    await vi.advanceTimersByTimeAsync(200);
    await expect(gone).resolves.toBeUndefined();
    expect(signal.mock.calls[0]).toEqual([-1234, "SIGTERM"]);
    expect(signal.mock.lastCall).toEqual([-1234, "SIGKILL"]);
  });

  it("stops waiting as soon as the last process of the group ended", async () => {
    vi.useFakeTimers();
    setPlatform("linux");
    let isAlive = true;
    const signal = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === 0 && !isAlive) throw ESRCH();
      return true;
    });

    const gone = ptyKill.terminate(1234);
    await vi.advanceTimersByTimeAsync(1_000);
    isAlive = false;
    await vi.advanceTimersByTimeAsync(100);
    await expect(gone).resolves.toBeUndefined();
    expect(signal).not.toHaveBeenCalledWith(-1234, "SIGKILL");
  });

  it("counts a group it may not signal (EPERM) as alive", async () => {
    vi.useFakeTimers();
    setPlatform("linux");
    const signal = vi.spyOn(process, "kill").mockImplementation((_pid, sig) => {
      if (sig === 0) throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
      return true;
    });

    const gone = ptyKill.terminate(1234);
    await vi.advanceTimersByTimeAsync(5_100);
    await gone;
    expect(signal).toHaveBeenCalledWith(-1234, "SIGKILL");
  });

  it("never throws for a group that is already gone", async () => {
    setPlatform("linux");
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw ESRCH();
    });
    await expect(ptyKill.terminate(1234)).resolves.toBeUndefined();
  });

  it.each([0, -5, Number.NaN])("signals nothing for pid %s (never its own group)", async (pid) => {
    setPlatform("linux");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);
    await ptyKill.terminate(pid);
    expect(signal).not.toHaveBeenCalled();
  });
});
