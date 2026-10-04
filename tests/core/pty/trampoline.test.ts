import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodePayload } from "../../../src/core/pty/trampoline-payload.js";
import { locateTrampoline, trampolineLaunch } from "../../../src/core/pty/trampoline.js";
import { SUITE_LOCALE, useLocale } from "../../support/locale.js";

/**
 * Where the trampoline is found and how node-pty is told to start it: always
 * node, the kept loader flags, the sibling script and one encoded argument.
 */

const SPAWN_TIMEOUT_MS = 60_000;

let dir: string;
let distDir: string;
let srcDir: string;

beforeAll(async () => {
  // Resolved: locateTrampoline answers in real paths, and macOS's tmpdir is
  // itself behind a link (/var → /private/var).
  dir = await realpath(await mkdtemp(join(tmpdir(), "gup-trampoline-")));
  distDir = join(dir, "dist");
  srcDir = join(dir, "src");
  await mkdirWith(distDir, ["cli.js", "pty-exec.js"]);
  await mkdirWith(srcDir, ["cli.ts", "pty-exec.ts"]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function mkdirWith(path: string, files: readonly string[]): Promise<void> {
  await mkdir(path, { recursive: true });
  await Promise.all(files.map((file) => writeFile(join(path, file), "", "utf8")));
}

describe("locateTrampoline", () => {
  it("finds the bundle beside the built CLI", () => {
    const location = locateTrampoline({ argv1: join(distDir, "cli.js"), execArgv: [] });
    expect(location).toEqual({ script: join(distDir, "pty-exec.js"), execArgv: [] });
  });

  it("finds the source entry beside the CLI run through tsx", () => {
    const location = locateTrampoline({ argv1: join(srcDir, "cli.ts"), execArgv: [] });
    expect(location?.script).toBe(join(srcDir, "pty-exec.ts"));
  });

  it("is null when the trampoline is missing, or when there is no script at all", async () => {
    const lonely = join(dir, "lonely");
    await mkdirWith(lonely, ["cli.js"]);
    expect(locateTrampoline({ argv1: join(lonely, "cli.js"), execArgv: [] })).toBeNull();
    expect(locateTrampoline({ argv1: join(dir, "missing", "cli.js"), execArgv: [] })).toBeNull();
    expect(locateTrampoline({ argv1: undefined, execArgv: [] })).toBeNull();
  });

  it("follows a symlinked CLI (the npm global bin) to the real directory", async (context) => {
    const link = join(dir, "gup-link.js");
    try {
      await symlink(join(distDir, "cli.js"), link);
    } catch {
      // Windows without the symlink privilege (no developer mode).
      context.skip();
    }
    const location = locateTrampoline({ argv1: link, execArgv: [] });
    expect(location?.script).toBe(join(distDir, "pty-exec.js"));
  });

  it("keeps module loaders and warning switches, drops the debugger and the rest", () => {
    const execArgv = [
      "--require", "/tsx/preflight.cjs",
      "--import", "file:///tsx/loader.mjs",
      "-r", "./hook.cjs",
      "--loader=./old-loader.mjs",
      "--experimental-vm-modules",
      "--experimental-loader", "./exp.mjs",
      "--disable-warning=ExperimentalWarning",
      "--no-warnings",
      "--inspect-brk=9229",
      "--inspect",
      "--debug-port=9230",
      "--max-old-space-size=4096",
      "--enable-source-maps",
    ];
    expect(locateTrampoline({ argv1: join(distDir, "cli.js"), execArgv })?.execArgv).toEqual([
      "--require", "/tsx/preflight.cjs",
      "--import", "file:///tsx/loader.mjs",
      "-r", "./hook.cjs",
      "--loader=./old-loader.mjs",
      "--experimental-vm-modules",
      "--experimental-loader", "./exp.mjs",
      "--disable-warning=ExperimentalWarning",
      "--no-warnings",
    ]);
  });
});

describe("trampolineLaunch", () => {
  const location = { script: "/opt/gup/dist/pty-exec.js", execArgv: ["--import", "tsx"] };

  it("runs node with the kept flags, the script and one encoded request", () => {
    const request = {
      command: "winget",
      args: ["upgrade", "--id", "Git.Git"],
      cwd: "/tmp",
      shell: false,
    };
    const launch = trampolineLaunch(request, location, "/tmp/gup-pty-1/a.exit");

    expect(launch.file).toBe(process.execPath);
    expect(launch.args.slice(0, 3)).toEqual(["--import", "tsx", "/opt/gup/dist/pty-exec.js"]);
    expect(launch.args).toHaveLength(4);
    expect(decodePayload(launch.args[3]!)).toEqual({
      v: 1,
      ...request,
      exitFile: "/tmp/gup-pty-1/a.exit",
      locale: SUITE_LOCALE,
    });
  });

  it("carries only the request's own fields, and the language gup speaks", () => {
    const request = { command: "npm", args: ["i", "-g", "pnpm"], extra: "ignored" };
    const encoded = trampolineLaunch(request, location).args.at(-1)!;
    expect(decodePayload(encoded)).toStrictEqual({
      v: 1,
      command: "npm",
      args: ["i", "-g", "pnpm"],
      locale: SUITE_LOCALE,
    });
  });
});

/**
 * The trampoline runs in a process of its own, which never chooses a
 * language: it speaks the one its request carries. The real one, through
 * tsx, given a command the runner's barrier refuses once the request is
 * decoded (`;` is in no command name), prints its refusal.
 */
describe("the trampoline's language", () => {
  const source = {
    script: join(process.cwd(), "src", "pty-exec.ts"),
    execArgv: ["--import", "tsx"],
  };

  function refusal(): Promise<{ readonly code: unknown; readonly stderr: string }> {
    const launch = trampolineLaunch({ command: "refused;command", args: [] }, source);
    return new Promise((resolve) => {
      execFile(launch.file, [...launch.args], { timeout: SPAWN_TIMEOUT_MS }, (error, _out, stderr) =>
        resolve({ code: error?.code ?? 0, stderr: String(stderr) }),
      );
    });
  }

  it(
    "is gup's, which the request carries",
    async () => {
      await expect(refusal()).resolves.toEqual({
        code: 2,
        stderr: "gup : requête de terminal invalide\n",
      });
    },
    SPAWN_TIMEOUT_MS,
  );

  describe("in English", () => {
    useLocale("en");

    it(
      "refuses a request in English",
      async () => {
        await expect(refusal()).resolves.toEqual({
          code: 2,
          stderr: "gup: invalid terminal request\n",
        });
      },
      SPAWN_TIMEOUT_MS,
    );
  });
});
