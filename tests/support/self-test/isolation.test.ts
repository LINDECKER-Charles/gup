import { homedir, platform, tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { HOST_PLATFORM, restorePlatform, setPlatform } from "../platform.js";
import { violationReport } from "../system/errors.js";
import { system } from "../system/fake-system.js";
import { HOST_SIM_PLATFORM, LINUX_HOME, MAC_HOME, WIN_HOME } from "../system/os-identity.js";
import { SANDBOX_ROOT_VAR } from "../test-env.js";

describe("simulated OS identity", () => {
  const windowsTemp = `${WIN_HOME}\\AppData\\Local\\Temp`;

  it.each([
    { simulated: "win32", home: WIN_HOME, temp: windowsTemp, uid: undefined },
    { simulated: "darwin", home: MAC_HOME, temp: "/var/folders/u/T", uid: 501 },
    { simulated: "linux", home: LINUX_HOME, temp: "/tmp", uid: 1000 },
  ] as const)("presents $simulated with its home, temp dir and uid", async (identity) => {
    await system.load({ platform: identity.simulated });

    expect(process.platform).toBe(identity.simulated);
    expect(platform()).toBe(identity.simulated);
    expect(homedir()).toBe(identity.home);
    expect(tmpdir()).toBe(identity.temp);
    expect(process.getuid?.()).toBe(identity.uid);
  });

  it("merges the case's env over the platform's scrubbed defaults", async () => {
    const env = { XDG_STATE_HOME: "/state", HOME: "/root" };
    await system.load({ platform: "linux", env, uid: 0 });

    expect(process.env["XDG_STATE_HOME"]).toBe("/state");
    expect(process.env["USER"]).toBe("u");
    expect(homedir()).toBe("/root");
    expect(process.getuid?.()).toBe(0);
  });

  it("answers win32 env variables in any case, keeping their declared spelling", async () => {
    await system.load({ platform: "win32", env: { Path: "C:\\bin" } });

    expect(process.env["PATH"]).toBe("C:\\bin");
    process.env["localappdata"] = "D:\\Local";
    expect(process.env["LOCALAPPDATA"]).toBe("D:\\Local");
    expect(Object.keys(process.env)).toContain("LOCALAPPDATA");
    expect({ ...process.env }).toMatchObject({ Path: "C:\\bin" });
    delete process.env["path"];
    expect("PATH" in process.env).toBe(false);
  });

  it("keeps POSIX env variables case-sensitive", async () => {
    await system.load({ platform: "darwin" });

    expect(process.env["home"]).toBeUndefined();
  });

  it("carries the shared test env and vitest's variables into every simulated env", async () => {
    await system.load({ platform: "darwin" });

    expect(process.env[SANDBOX_ROOT_VAR]).toBeTruthy();
    expect(process.env["GUP_HISTORY"]).toBe("0");
    expect(process.env["TZ"]).toBe("UTC");
    expect(process.env["VITEST_POOL_ID"]).toBeTruthy();
  });

  it("never lets the developer's real environment through", () => {
    system.restore();
    process.env["GUP_SELF_TEST_SENTINEL"] = "real";
    system.reset();

    expect(process.env["GUP_SELF_TEST_SENTINEL"]).toBeUndefined();

    system.restore();
    delete process.env["GUP_SELF_TEST_SENTINEL"];
  });

  it("restores the real platform and env", async () => {
    await system.load({ platform: "darwin", env: { ONLY_SIMULATED: "1" } });

    system.restore();

    expect(process.platform).toBe(HOST_PLATFORM);
    expect(process.env["ONLY_SIMULATED"]).toBeUndefined();
    expect(process.env[SANDBOX_ROOT_VAR]).toBeTruthy();
  });
});

// Sequential by default: the second test observes what the first one left.
describe("isolation between tests", () => {
  it("leaves a foreign platform and a dirty machine behind on purpose", async () => {
    const foreign = HOST_SIM_PLATFORM === "darwin" ? "win32" : "darwin";
    await system.load({ platform: foreign, bin: { brew: "/opt/homebrew/bin/brew" } });
    system.inject({ on: "spawn", argv: ["brew", "outdated"], mode: "exit-1" });
    system.answerInstall({ exitCode: 9 });
  });

  it("starts the next test on an empty machine of the host platform", () => {
    expect(process.platform).toBe(HOST_SIM_PLATFORM);
    expect(system.trace).toEqual({ spawns: [], requests: [], fsReads: [] });
    expect(system.unscripted).toEqual([]);
  });
});

describe("violation report", () => {
  it("is null when the test left no violation", () => {
    expect(violationReport([])).toBeNull();
  });

  it("lists every violation and says how to resolve it", () => {
    const violations = [new Error("unscripted spawn a"), new Error("unscripted request b")];
    const report = violationReport(violations);

    expect(report).toContain("2 strict fake-system violation(s)");
    expect(report).toContain("- unscripted spawn a\n- unscripted request b");
    expect(report).toContain("system.acknowledgeUnscripted()");
  });
});

describe("setPlatform", () => {
  it("switches process.platform and puts the real one back", () => {
    setPlatform("aix");
    expect(process.platform).toBe("aix");

    restorePlatform();
    expect(process.platform).toBe(HOST_PLATFORM);
    expect(Object.getOwnPropertyDescriptor(process, "platform")).toMatchObject({
      enumerable: true,
      configurable: true,
    });
  });
});
