import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunResult } from "../../src/core/runner.js";

/**
 * A command planted in the working directory under a real tool's name must
 * never run in its place. Windows searches the working directory before PATH
 * — execa's resolver and cmd.exe alike — unless its own switch says not to,
 * which the runner sets when it loads. Whoever runs the tests may export that
 * switch already: it is removed before the runner is imported, so what this
 * file checks is the runner's own setting.
 */
const NO_CWD_LOOKUP_ENV = "NoDefaultCurrentDirectoryInExePath";
delete process.env[NO_CWD_LOOKUP_ENV];
const { createPipeSink, run, runInherit } = await import("../../src/core/runner.js");
const { routeInheritTo } = await import("../../src/core/process/inherit-sink.js");

/** Same budget as runner-spawn.test.ts: Defender inspects every image on hosted runners. */
const SPAWN_TIMEOUT_MS = 30_000;
/** A tool every Windows has under System32, and the name the planted script takes. */
const VICTIM = "hostname";
const PLANTED_OUTPUT = "planted-in-the-working-directory";

let root: string;
let planted: string;
let shimDir: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "gup-cwd-lookup-"));
  planted = join(root, "planted");
  shimDir = join(root, "shims");
  await mkdir(planted);
  await mkdir(shimDir);
  await writeFile(join(planted, `${VICTIM}.cmd`), `@echo ${PLANTED_OUTPUT}\r\n`, "utf8");
  // A shim that calls the tool by bare name, as `.cmd` shims call their helpers.
  await writeFile(join(shimDir, "calls-victim.cmd"), `@${VICTIM}\r\n`, "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function expectRealTool(result: RunResult, output: string): void {
  expect(result.failed).toBe(false);
  expect(output).not.toContain(PLANTED_OUTPUT);
  expect(output.trim()).not.toBe("");
}

describe.runIf(process.platform === "win32")("runner: no command lookup in cwd", () => {
  it("probes run the tool on PATH, not the file planted in the working directory", async () => {
    const result = await run(VICTIM, [], { cwd: planted });
    expectRealTool(result, result.stdout);
  });

  it("installs run the tool on PATH, not the file planted in the working directory", async () => {
    const lines: string[] = [];
    const restore = routeInheritTo(
      createPipeSink({ capBytes: 4096, onLine: (line) => lines.push(line) }),
    );
    try {
      const result = await runInherit(VICTIM, [], { cwd: planted });
      expectRealTool(result, lines.join("\n"));
    } finally {
      restore();
    }
  });

  it("the cmd.exe behind a .cmd shim does not search the working directory either", async () => {
    const result = await run(join(shimDir, "calls-victim.cmd"), [], { cwd: planted });
    expectRealTool(result, result.stdout);
  });
}, SPAWN_TIMEOUT_MS);
