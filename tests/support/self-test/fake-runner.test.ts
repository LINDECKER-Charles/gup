import { describe, expect, it } from "vitest";
import {
  commandExists,
  consumeInterrupt,
  getInstallTimeoutSeconds,
  isElevated,
  run,
  runInherit,
  skipCurrent,
  whichFirst,
} from "../../../src/core/runner.js";
import { UnscriptedSpawnError } from "../system/errors.js";
import { GARBAGE_OUTPUT } from "../system/fake-runner.js";
import { system } from "../system/fake-system.js";
import type { SystemSpec } from "../system/types.js";

const TOFU = "C:\\Users\\u\\scoop\\shims\\tofu.exe";

const WINDOWS_TOFU: SystemSpec = {
  platform: "win32",
  bin: { tofu: TOFU },
  commands: [{ argv: ["tofu", "version"], stdout: "OpenTofu v1.7.2\n" }],
};

describe("fake runner: run()", () => {
  it("answers a scripted argv, stripping one final newline like the real runner", async () => {
    await system.load(WINDOWS_TOFU);

    await expect(run("tofu", ["version"])).resolves.toEqual({
      stdout: "OpenTofu v1.7.2",
      stderr: "",
      exitCode: 0,
      failed: false,
    });
  });

  it("marks a non-zero scripted exit as failed", async () => {
    await system.load({
      platform: "linux",
      bin: { pip: "/usr/bin/pip" },
      commands: [{ argv: ["pip", "list"], stderr: "boom", exitCode: 2 }],
    });

    await expect(run("pip", ["list"])).resolves.toEqual({
      stdout: "",
      stderr: "boom",
      exitCode: 2,
      failed: true,
    });
  });

  it("plays `then` answers on repeated calls and repeats the last one", async () => {
    await system.load({
      platform: "linux",
      bin: { brew: "/home/linuxbrew/.linuxbrew/bin/brew" },
      commands: [
        { argv: ["brew", "outdated"], stdout: "a", then: [{ stdout: "b" }, { stdout: "c" }] },
      ],
    });

    const outputs = [];
    for (let call = 0; call < 4; call++) outputs.push((await run("brew", ["outdated"])).stdout);

    expect(outputs).toEqual(["a", "b", "c", "c"]);
  });

  it("answers `where` on win32 and `which` on POSIX from `bin`, unscripted", async () => {
    await system.load(WINDOWS_TOFU);
    await expect(run("where", ["tofu"])).resolves.toMatchObject({ stdout: TOFU, failed: false });
    await expect(run("where", ["terraform"])).resolves.toMatchObject({ stdout: "", failed: true });

    await system.load({ platform: "darwin", bin: { tofu: "/opt/homebrew/bin/tofu" } });
    await expect(run("which", ["tofu"])).resolves.toMatchObject({
      stdout: "/opt/homebrew/bin/tofu",
      failed: false,
    });
  });

  it("does not answer the other platform's lookup tool", async () => {
    await system.load({ platform: "darwin", bin: { tofu: "/opt/homebrew/bin/tofu" } });

    await expect(run("where", ["tofu"])).resolves.toEqual({
      stdout: "",
      stderr: "",
      exitCode: -1,
      failed: true,
    });
  });

  it("fails like a missing executable for an absent binary, by name or by path", async () => {
    await system.load({ platform: "win32" });

    const missing = { stdout: "", stderr: "", exitCode: -1, failed: true };
    await expect(run("pip", ["--version"])).resolves.toEqual(missing);
    await expect(run("C:\\Program Files\\Tool\\tool.exe", ["-v"])).resolves.toEqual(missing);
  });

  it("throws, and records, an unscripted spawn of a present binary", async () => {
    await system.load(WINDOWS_TOFU);

    await expect(run("tofu", ["providers"])).rejects.toThrow(UnscriptedSpawnError);
    await expect(run("tofu", ["providers"])).rejects.toThrow(/\["tofu","version"\]/);

    expect(system.unscripted).toHaveLength(2);
    system.acknowledgeUnscripted();
  });

  it("keeps a recorded violation when the test loads another machine", async () => {
    // Contract checks reload between steps: a violation of an early step must survive.
    await system.load(WINDOWS_TOFU);
    await run("tofu", ["providers"]).catch(() => undefined);
    await system.load({ platform: "linux" });

    expect(system.unscripted).toHaveLength(1);
    system.acknowledgeUnscripted();
  });

  it("treats a binary declared by path in `fs` as present", async () => {
    const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
    await system.load({ platform: "win32", fs: { [vswhere]: { kind: "file" } } });

    await expect(run(vswhere, ["-all"])).rejects.toThrow(UnscriptedSpawnError);
    system.acknowledgeUnscripted();
  });

  it("answers unscripted spawns as failures in explore mode, without recording them", async () => {
    await system.load(WINDOWS_TOFU);
    system.explore(true);

    await expect(run("tofu", ["providers"])).resolves.toMatchObject({ exitCode: 1, failed: true });
    expect(system.unscripted).toEqual([]);
  });

  it.each([
    ["exit-1", { stdout: "", stderr: "", exitCode: 1, failed: true }],
    ["empty", { stdout: "", stderr: "", exitCode: 0, failed: false }],
    ["garbage", { stdout: GARBAGE_OUTPUT, stderr: "", exitCode: 0, failed: false }],
    ["timeout", { stdout: "", stderr: "", exitCode: -1, failed: true, timedOut: true }],
  ] as const)("lets an injected %s fault win over the script", async (mode, expected) => {
    await system.load(WINDOWS_TOFU);
    system.inject({ on: "spawn", argv: ["tofu", "version"], mode });

    await expect(run("tofu", ["version"])).resolves.toEqual(expected);
  });

  it("rejects on an injected `rejects` fault, as the runner's argv barrier does", async () => {
    await system.load(WINDOWS_TOFU);
    system.inject({ on: "spawn", argv: ["tofu", "version"], mode: "rejects" });

    await expect(run("tofu", ["version"])).rejects.toThrow("injected fault");
  });

  it("answers every spawn with an empty success on a permissive machine", async () => {
    await system.load({ platform: "linux", permissive: true });

    await expect(run("anything", ["at", "all"])).resolves.toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
      failed: false,
    });
  });

  it("answers `afterInstall` once an install has run on the machine", async () => {
    await system.load({
      platform: "darwin",
      bin: { pkgin: "/opt/pkg/bin/pkgin" },
      commands: [
        { argv: ["pkgin", "-l", "<", "list"], stdout: "pending", afterInstall: { stdout: "" } },
      ],
    });

    await expect(run("pkgin", ["-l", "<", "list"])).resolves.toMatchObject({ stdout: "pending" });
    await runInherit("sudo", ["pkgin", "-y", "upgrade"]);
    await expect(run("pkgin", ["-l", "<", "list"])).resolves.toMatchObject({ stdout: "" });
  });

  it("traces the wall-clock cap a probe asked for", async () => {
    await system.load(WINDOWS_TOFU);

    await run("tofu", ["version"], { timeout: 60_000 });

    expect(system.trace.spawns).toEqual([
      { mode: "run", argv: ["tofu", "version"], shell: false, timeout: 60_000 },
    ]);
  });

  it("refuses two scripts for the same argv", async () => {
    await expect(
      system.load({
        platform: "linux",
        commands: [{ argv: ["a"] }, { argv: ["a"] }],
      }),
    ).rejects.toThrow("two command scripts");
  });
});

describe("fake runner: runInherit()", () => {
  it("succeeds by default and traces argv, shell and cwd", async () => {
    await system.load({ platform: "win32" });

    const result = await runInherit("scoop", ["update", "x"], { shell: true, cwd: "C:\\w" });

    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0, failed: false });
    expect(system.trace.spawns).toEqual([
      { mode: "inherit", argv: ["scoop", "update", "x"], shell: true, cwd: "C:\\w" },
    ]);
  });

  it("plays queued install answers in order, then succeeds again", async () => {
    await system.load({ platform: "linux" });
    system.answerInstall({ exitCode: 0 }, { exitCode: 7 });

    const codes = [];
    for (let call = 0; call < 3; call++) codes.push((await runInherit("npm", ["i", "x"])).exitCode);

    expect(codes).toEqual([0, 7, 0]);
  });

  it("reports a timeout and a manual skip through consumeInterrupt", async () => {
    await system.load({ platform: "linux" });
    system.answerInstall({ timedOut: true }, { aborted: true });

    await expect(runInherit("a")).resolves.toMatchObject({ failed: true, timedOut: true });
    expect(consumeInterrupt()).toEqual({ timedOut: true, aborted: false });
    await expect(runInherit("b")).resolves.toMatchObject({ failed: true, aborted: true });
    expect(consumeInterrupt()).toEqual({ timedOut: false, aborted: true });
    expect(consumeInterrupt()).toEqual({ timedOut: false, aborted: false });
  });

  it("rejects when an answer says the runner rejected", async () => {
    await system.load({ platform: "linux" });
    system.answerInstall({ rejects: true });

    await expect(runInherit("a")).rejects.toThrow("injected fault");
  });

  it("applies spawn faults to installs: exit-1 fails, timeout interrupts", async () => {
    await system.load({ platform: "linux" });
    system.inject({ on: "spawn", argv: ["a"], mode: "exit-1" });
    system.inject({ on: "spawn", argv: ["b"], mode: "timeout" });

    await expect(runInherit("a")).resolves.toMatchObject({ exitCode: 1, failed: true });
    await expect(runInherit("b")).resolves.toMatchObject({ failed: true, timedOut: true });
    expect(consumeInterrupt().timedOut).toBe(true);
  });
});

describe("fake runner: PATH and privileges", () => {
  it("resolves `bin` names and nothing else", async () => {
    await system.load(WINDOWS_TOFU);

    await expect(whichFirst("tofu")).resolves.toBe(TOFU);
    await expect(whichFirst("terraform")).resolves.toBeNull();
    await expect(whichFirst("C:\\tools\\tofu")).resolves.toBeNull();
    await expect(commandExists("tofu")).resolves.toBe(true);
    await expect(commandExists("terraform")).resolves.toBe(false);
  });

  it("finds every binary on a permissive machine, in the platform's path flavour", async () => {
    await system.load({ platform: "darwin", permissive: true });

    await expect(whichFirst("mas")).resolves.toBe("/usr/local/bin/mas");
  });

  it("reports elevation as declared, false by default", async () => {
    await system.load({ platform: "win32" });
    await expect(isElevated()).resolves.toBe(false);

    await system.load({ platform: "win32", elevated: true });
    await expect(isElevated()).resolves.toBe(true);
  });

  it("keeps the runner's other exports real", async () => {
    await system.load({ platform: "win32" });

    expect(getInstallTimeoutSeconds()).toBeGreaterThan(0);
    expect(skipCurrent()).toBe(false);
  });
});
