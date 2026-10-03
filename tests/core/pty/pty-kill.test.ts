import { afterEach, describe, expect, it, vi } from "vitest";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * How a pseudo-terminal's tree is killed. `killProcessTree` (taskkill) and
 * `process.kill` are replaced: a unit test never kills anything real.
 */
const { killProcessTreeMock } = vi.hoisted(() => ({ killProcessTreeMock: vi.fn() }));
vi.mock("../../../src/core/runner.js", () => ({ killProcessTree: killProcessTreeMock }));

import { ptyKill } from "../../../src/core/pty/pty-kill.js";

afterEach(() => {
  restorePlatform();
  vi.restoreAllMocks();
});

describe("ptyKill on Windows", () => {
  it("takes the whole tree down with taskkill at once, with nothing left to force", () => {
    setPlatform("win32");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);

    ptyKill.terminate(1234);
    ptyKill.force(1234);

    expect(killProcessTreeMock).toHaveBeenCalledExactlyOnceWith(1234);
    expect(signal).not.toHaveBeenCalled();
  });
});

describe("ptyKill on POSIX", () => {
  it("signals the trampoline's process group: TERM first, KILL to force", () => {
    setPlatform("darwin");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);

    ptyKill.terminate(1234);
    ptyKill.force(1234);

    expect(signal.mock.calls).toEqual([
      [-1234, "SIGTERM"],
      [-1234, "SIGKILL"],
    ]);
    expect(killProcessTreeMock).not.toHaveBeenCalled();
  });

  it("never throws for a group that is already gone", () => {
    setPlatform("linux");
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    expect(() => ptyKill.terminate(1234)).not.toThrow();
    expect(() => ptyKill.force(1234)).not.toThrow();
  });

  it.each([0, -5, Number.NaN])("signals nothing for pid %s (never its own group)", (pid) => {
    setPlatform("linux");
    const signal = vi.spyOn(process, "kill").mockImplementation(() => true);
    ptyKill.terminate(pid);
    ptyKill.force(pid);
    expect(signal).not.toHaveBeenCalled();
  });
});
