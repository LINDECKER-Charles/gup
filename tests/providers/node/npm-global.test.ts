import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { NpmGlobalProvider } from "../../../src/providers/node/npm-global.js";
import { restoreStagedCopy } from "../../../src/providers/node/npm-staged-copy.js";
import { system } from "../../support/system/fake-system.js";
import type { FsNode, SystemSpec } from "../../support/system/types.js";
import { NPM_GLOBAL_ROOT, npmMachine } from "./node.cases.js";

/** `npm outdated -g --json`: an object keyed by package, `{}` when nothing is behind. */

describe("NpmGlobalProvider.listOutdated", () => {
  it("lists nothing for an empty report", async () => {
    await system.load(npmMachine("{}"));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips entries without both versions, or already current", async () => {
    const report = {
      "pkg-equal": { current: "1.0.0", wanted: "1.0.0", latest: "1.0.0" },
      "pkg-no-current": { latest: "1.0.0" },
      "pkg-no-latest": { current: "1.0.0" },
      "pkg-ok": { current: "1.0.0", wanted: "2.0.0", latest: "2.0.0" },
    };
    await system.load(npmMachine(JSON.stringify(report)));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([
      { id: "pkg-ok", name: "pkg-ok", current: "1.0.0", latest: "2.0.0" },
    ]);
  });

  // What npm 11 prints when its registry answers 503, or cannot be reached:
  // read as "nothing outdated" before, so the scan said `à jour`.
  it.each([
    [
      { code: "E503", summary: "503 Service Unavailable - GET https://registry.npmjs.org/typescript", detail: "" },
      "npm outdated a échoué (E503) : 503 Service Unavailable - GET https://registry.npmjs.org/typescript",
    ],
    [
      {
        code: "ECONNREFUSED",
        summary: "FetchError: request to https://registry.npmjs.org/typescript failed",
        detail: "If you are behind a proxy, please make sure that the 'proxy' config is set properly.",
      },
      "npm outdated a échoué (ECONNREFUSED) : FetchError: request to https://registry.npmjs.org/typescript failed",
    ],
    [{ summary: "network\n  timeout" }, "npm outdated a échoué : network timeout"],
  ])("reports npm's own error report as a scan error (%o)", async (error, message) => {
    await system.load(npmMachine(JSON.stringify({ error }, null, 2)));
    await expect(new NpmGlobalProvider().listOutdated()).rejects.toThrow(message);
  });

  it("still reads a global package that happens to be named `error`", async () => {
    const report = { error: { current: "7.0.0", wanted: "7.0.0", latest: "10.4.0", location: "" } };
    await system.load(npmMachine(JSON.stringify(report)));
    await expect(new NpmGlobalProvider().listOutdated()).resolves.toEqual([
      { id: "error", name: "error", current: "7.0.0", latest: "10.4.0" },
    ]);
  });
});

/**
 * Before it fetches a new version, npm moves the installed package aside —
 * `<root>/<name>` → `<root>/.<name>-<hash>`, each command shim likewise — and
 * creates an empty directory for the new one; a kill ends npm before it can
 * move them back. Machines below are what such a kill leaves on disk.
 */
describe("NpmGlobalProvider.update when npm was stopped before its rollback", () => {
  const ROOT = NPM_GLOBAL_ROOT;
  const PREFIX = win32.dirname(ROOT);
  /** Any suffix npm could have picked: 8 alphanumerics. */
  const SUFFIX = "Ab3dEf9h";
  const RESTORED = "version précédente restaurée";

  const manifest = (version: string, bin?: unknown): FsNode => ({
    kind: "file",
    content: JSON.stringify({ name: "typescript", version, ...(bin !== undefined && { bin }) }),
  });

  /** The three shims npm links on Windows for `command`, staged. */
  const stagedShims = (command: string): Record<string, FsNode> =>
    Object.fromEntries(
      ["", ".cmd", ".ps1"].map((suffix) => [
        `${PREFIX}\\.${command}${suffix}-${SUFFIX}`,
        { kind: "file", content: `shim ${command}${suffix}` },
      ]),
    );

  const machine = (fs: Record<string, FsNode>): SystemSpec => ({ ...npmMachine("{}"), fs });

  it("moves the staged package and its command shims back, and says so", async () => {
    await system.load(
      machine({
        [`${ROOT}\\.typescript-${SUFFIX}\\package.json`]: manifest("5.4.5", {
          tsc: "bin/tsc",
          tsserver: "bin/tsserver",
        }),
        [`${ROOT}\\typescript`]: { kind: "dir" },
        ...stagedShims("tsc"),
        ...stagedShims("tsserver"),
      }),
    );
    system.answerInstall({ aborted: true });

    await expect(new NpmGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: false,
      recovery: RESTORED,
    });
    await expect(readFile(`${ROOT}\\typescript\\package.json`, "utf8")).resolves.toContain("5.4.5");
    await expect(readdir(ROOT)).resolves.toEqual(["typescript"]);
    await expect(readFile(`${PREFIX}\\tsc.cmd`, "utf8")).resolves.toBe("shim tsc.cmd");
    expect((await readdir(PREFIX)).sort()).toEqual([
      "node_modules",
      "tsc",
      "tsc.cmd",
      "tsc.ps1",
      "tsserver",
      "tsserver.cmd",
      "tsserver.ps1",
    ]);
  });

  it("restores a package whose directory npm never got to create", async () => {
    await system.load(
      machine({ [`${ROOT}\\.typescript-${SUFFIX}\\package.json`]: manifest("5.4.5") }),
    );
    system.answerInstall({ timedOut: true });

    await expect(new NpmGlobalProvider().update("typescript")).resolves.toMatchObject({
      recovery: RESTORED,
    });
    await expect(readdir(ROOT)).resolves.toEqual(["typescript"]);
  });

  it("finds a scoped package in its scope's folder, its one command by unscoped name", async () => {
    await system.load(
      machine({
        [`${ROOT}\\@scope\\.tool-${SUFFIX}\\package.json`]: {
          kind: "file",
          content: JSON.stringify({ name: "@scope/tool", version: "1.0.0", bin: "cli.js" }),
        },
        [`${ROOT}\\@scope\\tool`]: { kind: "dir" },
        ...stagedShims("tool"),
      }),
    );
    system.answerInstall({ exitCode: 1 });

    await expect(new NpmGlobalProvider().update("@scope/tool")).resolves.toMatchObject({
      recovery: RESTORED,
    });
    await expect(readdir(`${ROOT}\\@scope`)).resolves.toEqual(["tool"]);
    expect((await readdir(PREFIX)).sort()).toEqual(["node_modules", "tool", "tool.cmd", "tool.ps1"]);
  });

  it("puts it back on macOS and Linux too: lib/node_modules, and bin symlinks", async () => {
    const root = "/usr/local/lib/node_modules";
    await system.load({
      platform: "darwin",
      bin: { npm: "/usr/local/bin/npm" },
      commands: [{ argv: ["npm", "root", "-g"], stdout: `${root}\n` }],
      fs: {
        [`${root}/.typescript-${SUFFIX}/package.json`]: manifest("5.4.5", { tsc: "bin/tsc" }),
        [`${root}/typescript`]: { kind: "dir" },
        [`/usr/local/bin/.tsc-${SUFFIX}`]: {
          kind: "symlink",
          target: "../lib/node_modules/typescript/bin/tsc",
        },
      },
    });
    system.answerInstall({ aborted: true });

    await expect(new NpmGlobalProvider().update("typescript")).resolves.toMatchObject({
      recovery: RESTORED,
    });
    await expect(readdir(root)).resolves.toEqual(["typescript"]);
    await expect(readdir("/usr/local/bin")).resolves.toEqual(["npm", "tsc"]);
  });

  it("takes the copy named after this very path when npm left several", async () => {
    const own = createHash("sha1")
      .update(`${ROOT}\\typescript`)
      .digest("base64")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 8);
    await system.load(
      machine({
        [`${ROOT}\\.typescript-Zz9Yy8Xx\\package.json`]: manifest("4.0.0"),
        [`${ROOT}\\.typescript-${own}\\package.json`]: manifest("5.4.5"),
      }),
    );
    system.answerInstall({ aborted: true });

    await new NpmGlobalProvider().update("typescript");
    await expect(readFile(`${ROOT}\\typescript\\package.json`, "utf8")).resolves.toContain("5.4.5");
  });

  it("leaves a package npm had begun writing alone, and says where the old copy is", async () => {
    const staged = `${ROOT}\\.typescript-${SUFFIX}`;
    await system.load(
      machine({
        [`${staged}\\package.json`]: manifest("5.4.5"),
        [`${ROOT}\\typescript\\package.json`]: manifest("5.6.2"),
      }),
    );
    system.answerInstall({ aborted: true });

    await expect(new NpmGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: false,
      recovery: `ancienne version mise de côté par npm dans ${staged}`,
    });
    await expect(readdir(ROOT)).resolves.toEqual([`.typescript-${SUFFIX}`, "typescript"]);
  });

  it("changes nothing when npm rolled back itself, or when the install went through", async () => {
    await system.load(machine({ [`${ROOT}\\typescript\\package.json`]: manifest("5.4.5") }));
    system.answerInstall({ exitCode: 1 });
    await expect(new NpmGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: false,
    });

    await system.load(machine({ [`${ROOT}\\.typescript-${SUFFIX}\\package.json`]: manifest("x") }));
    await expect(new NpmGlobalProvider().update("typescript")).resolves.toEqual({
      id: "typescript",
      success: true,
    });
    await expect(readdir(ROOT)).resolves.toEqual([`.typescript-${SUFFIX}`]);
  });

  it("restores every package of a failed batch", async () => {
    await system.load(
      machine({
        [`${ROOT}\\.typescript-${SUFFIX}\\package.json`]: manifest("5.4.5"),
        [`${ROOT}\\typescript`]: { kind: "dir" },
      }),
    );
    system.answerInstall({ aborted: true });

    const rows = [
      { id: "typescript", current: "5.4.5", latest: "5.6.2" },
      { id: "prettier", current: "3.0.0", latest: "3.3.3" },
    ];
    await expect(new NpmGlobalProvider().updateAll(rows)).resolves.toEqual([
      { id: "typescript", success: false, recovery: RESTORED },
      { id: "prettier", success: false },
    ]);
  });

  it("never reads the disk for an id that is not a package name", async () => {
    await system.load(machine({}));
    for (const id of ["..\\..\\Windows", "../x", "@scope/../../x", ".hidden", "a/b/c", ""]) {
      await expect(restoreStagedCopy(ROOT, id)).resolves.toEqual({ kind: "none" });
    }
    expect(system.trace.fsReads).toEqual([]);
  });
});
