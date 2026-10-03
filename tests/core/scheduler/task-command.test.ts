import { describe, expect, it } from "vitest";
import {
  COMMAND_REFUSALS,
  PACKAGE_NAME,
  resolveTaskCommand,
  type InstallationFacts,
} from "../../../src/core/scheduler/trigger/task-command.js";

const GLOBAL_ENTRY = "/usr/local/lib/node_modules/@charles_lindecker/gup/dist/cli.js";

/** A Linux machine where `gup` is a symlink to the global install. */
function facts(overrides: Partial<InstallationFacts> = {}): InstallationFacts {
  const links: Record<string, string> = {
    "/usr/local/bin/node": "/usr/local/bin/node",
    "/usr/local/bin/gup": GLOBAL_ENTRY,
  };
  return {
    execPath: "/usr/local/bin/node",
    entry: "/usr/local/bin/gup",
    platform: "linux",
    uid: 1000,
    tempDir: "/tmp",
    isWsl: false,
    realpath: (path) => {
      const target = links[path] ?? (path.startsWith("/") ? path : undefined);
      if (target === undefined) throw new Error(`ENOENT ${path}`);
      return target;
    },
    packageName: (packageJson) =>
      packageJson === "/usr/local/lib/node_modules/@charles_lindecker/gup/package.json"
        ? PACKAGE_NAME
        : undefined,
    ...overrides,
  };
}

describe("resolveTaskCommand", () => {
  it("registers the real paths of node and of the global gup", () => {
    expect(resolveTaskCommand(facts())).toEqual({
      node: "/usr/local/bin/node",
      entry: GLOBAL_ENTRY,
      args: ["__schedule-tick"],
    });
  });

  it("works with Windows paths", () => {
    const entry = "C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js";
    const windows = facts({
      platform: "win32",
      uid: undefined,
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      entry,
      tempDir: "C:\\Users\\a\\AppData\\Local\\Temp",
      realpath: (path) => path,
      packageName: (json) => (json.endsWith("\\gup\\package.json") ? PACKAGE_NAME : undefined),
    });
    expect(resolveTaskCommand(windows)).toMatchObject({ entry });
  });

  it.each([
    ["an npx copy", { entry: "/home/a/.npm/_npx/1234/node_modules/@charles_lindecker/gup/dist/cli.js" }, COMMAND_REFUSALS.notGlobal],
    ["a copy in the temp dir", { entry: "/tmp/gup/dist/cli.js" }, COMMAND_REFUSALS.notGlobal],
    ["another package's script", { entry: "/opt/other/dist/cli.js" }, COMMAND_REFUSALS.notGlobal],
    ["the sources run by tsx", { entry: "/home/a/gup/src/cli.ts" }, COMMAND_REFUSALS.fromSources],
    ["a root shell", { uid: 0 }, COMMAND_REFUSALS.root],
    ["WSL", { isWsl: true }, COMMAND_REFUSALS.wsl],
    ["no entry point", { entry: undefined }, COMMAND_REFUSALS.noEntry],
    ["a missing entry point", { entry: "relative/cli.js" }, COMMAND_REFUSALS.noEntry],
  ] as const)("refuses %s", (_label, overrides, error) => {
    expect(resolveTaskCommand(facts(overrides))).toEqual({ error });
  });

  it("refuses paths the OS would re-interpret, per platform", () => {
    const quoted = "/home/it's/node_modules/@charles_lindecker/gup/dist/cli.js";
    const linux = facts({ entry: quoted, packageName: () => PACKAGE_NAME });
    expect(resolveTaskCommand(linux)).toEqual({ error: COMMAND_REFUSALS.unsafePath(quoted) });
    const mac = facts({ platform: "darwin", entry: quoted, packageName: () => PACKAGE_NAME });
    expect(resolveTaskCommand(mac)).toMatchObject({ entry: quoted });
    const percent = "C:\\%TEMP%\\gup\\dist\\cli.js";
    const windows = facts({
      platform: "win32",
      entry: percent,
      tempDir: "C:\\Temp",
      realpath: (path) => path,
      packageName: () => PACKAGE_NAME,
    });
    expect(resolveTaskCommand(windows)).toEqual({ error: COMMAND_REFUSALS.unsafePath(percent) });
  });
});
