import { describe, expect, it } from "vitest";
import { SelfProvider } from "../../../src/providers/self.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest, npmLatestRoute, pypiRoute } from "../../support/system/releases.js";
import { installArgvs, installs, probeArgvs } from "../../support/system/trace.js";
import type { SimPlatform } from "../../support/system/types.js";
import {
  CHOCO_MACHINE,
  PIP_SELF_UPGRADE,
  PNPM_MACHINE,
  SCOOP_SHIM,
  versionProbe,
  YARN_MACHINE,
} from "./self.cases.js";

/**
 * The package managers' own updates: which targets a machine offers (Corepack
 * shims excluded), how each reads its version, and the update paths that
 * depend on the machine — elevation, Corepack, the Python behind pip.
 */

const NODE_DIR = "C:\\Program Files\\nodejs";
const PY_LAUNCHER = "C:\\Windows\\py.exe";

describe("SelfProvider.listOutdated", () => {
  it("leaves pnpm and yarn to Corepack when they are its shims", async () => {
    await system.load({
      platform: "win32",
      bin: {
        corepack: `${NODE_DIR}\\corepack.cmd`,
        pnpm: `${NODE_DIR}\\pnpm.cmd`,
        yarn: `${NODE_DIR}\\yarn.cmd`,
      },
    });
    await expect(new SelfProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs().filter((argv) => argv[1] === "--version")).toEqual([]);
  });

  it("asks only the targets on PATH for their version", async () => {
    await system.load(YARN_MACHINE);
    await new SelfProvider().listOutdated();
    expect(probeArgvs().filter((argv) => argv[1] === "--version")).toEqual([["yarn", "--version"]]);
  });

  it("reads scoop's version from its own output when the block header is missing", async () => {
    await system.load({
      platform: "win32",
      bin: { scoop: SCOOP_SHIM },
      commands: [versionProbe("scoop", "Scoop 0.4.0 - built on 2024-01-01")],
      http: [githubLatest("ScoopInstaller/Scoop", "v0.5.0")],
    });
    await expect(new SelfProvider().listOutdated()).resolves.toEqual([
      { id: "scoop", name: "Scoop", current: "0.4.0", latest: "0.5.0" },
    ]);
  });

  it("lists a target as current when only a `v` tells the versions apart", async () => {
    await system.load({
      platform: "win32",
      bin: { gh: "C:\\Program Files\\GitHub CLI\\gh.exe" },
      commands: [versionProbe("gh", "gh version 2.55.0 (2024-08-20)")],
      http: [githubLatest("cli/cli", "v2.55.0")],
    });
    await expect(new SelfProvider().listOutdated()).resolves.toEqual([]);
  });

  it("drops a target whose registry answer names no version", async () => {
    for (const [binary, route] of [
      ["npm", npmLatestRoute("npm")],
      ["pipx", pypiRoute("pipx")],
    ] as const) {
      await system.load({
        platform: "linux",
        bin: { [binary]: `/usr/local/bin/${binary}` },
        commands: [versionProbe(binary, "1.4.0")],
        http: [route],
      });
      await expect(new SelfProvider().listOutdated()).resolves.toEqual([]);
    }
  });
});

describe("SelfProvider targets per platform", () => {
  it.each<[SimPlatform, Readonly<Record<string, string>>]>([
    ["linux", { winget: "/usr/local/bin/winget", scoop: "/usr/local/bin/scoop", choco: "/usr/local/bin/choco" }],
    ["win32", { brew: "C:\\tools\\brew.cmd" }],
  ])("ignores the package managers foreign to %s, whatever answers on PATH", async (platform, bin) => {
    await system.load({ platform, bin });
    await expect(new SelfProvider().isAvailable()).resolves.toBe(false);
    await expect(new SelfProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });
});

describe("SelfProvider.update", () => {
  it("answers an unknown target with a failure", async () => {
    await expect(new SelfProvider().update("does-not-exist")).resolves.toEqual({
      id: "does-not-exist",
      success: false,
      message: "Cible self inconnue",
    });
  });

  it("skips Chocolatey with the elevation advice when gup is not elevated", async () => {
    await system.load({ ...CHOCO_MACHINE, elevated: false });
    const outcome = await new SelfProvider().update("choco");
    expect(outcome).toMatchObject({ id: "choco", success: false, skipped: true });
    expect(outcome.message).toMatch(/terminal admin/i);
    expect(installArgvs()).toEqual([]);
  });

  it("trusts pnpm's new version over the exit code of its self-update", async () => {
    // On Windows, `pnpm self-update` swaps the binary, then fails its cleanup.
    await system.load({
      ...PNPM_MACHINE,
      commands: [{ ...versionProbe("pnpm", "9.0.0"), afterInstall: { stdout: "9.5.0" } }],
    });
    system.answerInstall({ exitCode: 1 });
    await expect(new SelfProvider().update("pnpm")).resolves.toEqual({ id: "pnpm", success: true });
  });

  it("does not call a self-update that left the pnpm on PATH where it was a success", async () => {
    // pnpm 11+ puts its new version in $PNPM_HOME/bin, which an older PATH lacks.
    await system.load({ ...PNPM_MACHINE, commands: [versionProbe("pnpm", "12.4.1")] });
    const outcome = await new SelfProvider().update("pnpm");
    expect(outcome).toMatchObject({ id: "pnpm", success: false });
    expect(outcome.message).toContain("indique toujours 12.4.1");
    expect(outcome.message).toContain(String.raw`ajouter %PNPM_HOME%\bin au PATH`);
  });

  it("activates the stable Yarn through Corepack when Corepack is installed", async () => {
    const bin = { ...YARN_MACHINE.bin, corepack: "/usr/lib/node/corepack" };
    await system.load({ ...YARN_MACHINE, bin });
    system.answerInstall({ exitCode: 1 });
    const outcome = await new SelfProvider().update("yarn");
    expect(outcome).toEqual({ id: "yarn", success: false });
    expect(installArgvs()).toEqual([["corepack", "prepare", "yarn@stable", "--activate"]]);
  });

  it("runs gh's upgrade through the installer that owns it, with scoop's shell", async () => {
    await system.load({ platform: "win32", bin: { gh: "C:\\Users\\u\\scoop\\shims\\gh.exe" } });
    await new SelfProvider().update("gh");
    expect(installs()).toMatchObject([{ argv: ["scoop", "update", "gh"], shell: true }]);
  });
});

describe("SelfProvider.update('pip') — the Python behind the pip on PATH", () => {
  it("fails, running nothing, when no Python can be found", async () => {
    await system.load({ platform: "win32" });
    await expect(new SelfProvider().update("pip")).resolves.toEqual({
      id: "pip",
      success: false,
      message: "Python introuvable dans le PATH",
    });
    expect(installArgvs()).toEqual([]);
  });

  it("falls back to the `py` launcher when pip itself is not on PATH", async () => {
    await system.load({ platform: "win32", bin: { py: PY_LAUNCHER } });
    await new SelfProvider().update("pip");
    expect(installArgvs()).toEqual([["py", ...PIP_SELF_UPGRADE]]);
  });

  it("falls back to `py` when the pip on PATH has no python.exe beside it", async () => {
    const bin = { pip: "C:\\BrokenPython\\Scripts\\pip.exe", py: PY_LAUNCHER };
    await system.load({ platform: "win32", bin });
    await new SelfProvider().update("pip");
    expect(installArgvs()).toEqual([["py", ...PIP_SELF_UPGRADE]]);
  });

  it.each<[string, readonly string[], string]>([
    ["prefers python3 beside pip", ["python3", "python"], "/usr/local/bin/python3"],
    ["takes python when python3 is missing", ["python"], "/usr/local/bin/python"],
  ])("on POSIX, %s", async (_title, beside, expected) => {
    const fs = Object.fromEntries(
      beside.map((name) => [`/usr/local/bin/${name}`, { kind: "file" as const, executable: true }]),
    );
    await system.load({ platform: "linux", bin: { pip: "/usr/local/bin/pip" }, fs });
    await new SelfProvider().update("pip");
    expect(installArgvs()).toEqual([[expected, ...PIP_SELF_UPGRADE]]);
  });

  it.each(["python", "python3"])(
    "on POSIX, falls back to the first interpreter on PATH when none sits beside pip (%s)",
    async (interpreter) => {
      const bin = { pip: "/usr/local/bin/pip", [interpreter]: `/opt/python/bin/${interpreter}` };
      await system.load({ platform: "linux", bin });
      await new SelfProvider().update("pip");
      expect(installArgvs()).toEqual([[interpreter, ...PIP_SELF_UPGRADE]]);
    },
  );
});

describe("SelfProvider.updateAll", () => {
  it("updates target by target, in order, an unknown one included", async () => {
    await system.load({ platform: "linux" });
    const outcomes = await new SelfProvider().updateAll([
      { id: "npm", current: "1", latest: "2" },
      { id: "pipx", current: "1", latest: "2" },
      { id: "unknown", current: "1", latest: "2" },
    ]);
    expect(outcomes).toEqual([
      { id: "npm", success: true },
      { id: "pipx", success: true },
      { id: "unknown", success: false, message: "Cible self inconnue" },
    ]);
    expect(installArgvs()).toEqual([
      ["npm", "install", "-g", "npm@latest"],
      ["pipx", "upgrade", "pipx"],
    ]);
  });
});
