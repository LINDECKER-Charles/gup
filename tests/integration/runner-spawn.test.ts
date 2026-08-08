import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  commandExists,
  run,
  runInherit,
  whichFirst,
} from "../../src/core/runner.js";

/**
 * The only tests in this repo that actually spawn a process.
 *
 * Every other suite mocks `execa` wholesale (`tests/core/runner.test.ts` sets
 * `vi.mock("execa")`), which means the whole test suite can be green while the
 * spawn layer is broken. That blind spot became load-bearing when execa 9 → 10
 * replaced its Windows implementation: cross-spawn was dropped for execa's own
 * PATH resolver and cmd.exe escaper, so *every* command gup runs on Windows is
 * now constructed differently — and nothing exercised it.
 *
 * These tests are deliberately unmocked and deliberately cheap, so they can run
 * on all six CI legs. The Windows-only cases below are the ones that matter:
 * `.cmd` shims (npm, pnpm, yarn, corepack, gcloud, az…) go through cmd.exe,
 * which is exactly the code path that changed.
 */

let dir: string;
/** Prints its own argv as JSON so a caller can assert an exact round-trip. */
let echoScript: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-spawn-"));
  echoScript = join(dir, "argv-echo.mjs");
  await writeFile(
    echoScript,
    "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
    "utf8",
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function argvRoundTrip(args: string[]): Promise<string[]> {
  const res = await run(process.execPath, [echoScript, ...args]);
  expect(res.failed).toBe(false);
  return JSON.parse(res.stdout) as string[];
}

describe("runner: real process spawn", () => {
  it("passes argv as a vector, with no shell interpretation", async () => {
    // Metacharacters that a shell would act on. If any of these split the
    // command or vanish, the argv-vector guarantee the whole security model
    // rests on is broken.
    const payload = [
      "plain",
      "with space",
      'double"quote',
      "single'quote",
      "semi;colon",
      "amp&ersand",
      "pipe|char",
      "caret^char",
      "percent%VAR%",
      "dollar$HOME",
      "back`tick",
      "paren(then)",
      "gt>lt<",
      "star*glob",
      "accents éàî",
    ];
    await expect(argvRoundTrip(payload)).resolves.toEqual(payload);
  });

  it("does not expand environment-variable syntax of either shell", async () => {
    const payload = ["$HOME", "%USERPROFILE%", "${PATH}", "%PATH%"];
    await expect(argvRoundTrip(payload)).resolves.toEqual(payload);
  });

  it("preserves an empty argument", async () => {
    await expect(argvRoundTrip(["", "after"])).resolves.toEqual(["", "after"]);
  });

  it("decodes stdout as UTF-8", async () => {
    const res = await run(process.execPath, [
      "-e",
      'process.stdout.write("café ✓ — naïve")',
    ]);
    expect(res.stdout).toBe("café ✓ — naïve");
  });

  it("strips exactly one trailing newline", async () => {
    const res = await run(process.execPath, [
      "-e",
      String.raw`process.stdout.write("a\n\n")`,
    ]);
    expect(res.stdout).toBe("a\n");
  });

  it("reports a non-zero exit without throwing", async () => {
    const res = await run(process.execPath, ["-e", "process.exit(3)"]);
    expect(res.failed).toBe(true);
    expect(res.exitCode).toBe(3);
  });

  it("reports a missing binary as a failure, not a rejection", async () => {
    const res = await run("gup-definitely-not-a-real-binary", []);
    // The contract callers rely on is "resolves, and says it failed" — no
    // throw to unwind a provider mid-scan. The exit code itself is not part of
    // that contract and is not portable: POSIX surfaces the spawn ENOENT, so
    // execa reports no numeric code and run() falls back to its -1 sentinel,
    // while on Windows execa 10 resolves the lookup failure to exit code 1.
    // Asserting either literal pins the test to one platform.
    expect(res.failed).toBe(true);
    expect(res.exitCode).not.toBe(0);
  });

  it("captures stderr separately from stdout", async () => {
    const res = await run(process.execPath, [
      "-e",
      'process.stdout.write("OUT"); process.stderr.write("ERR")',
    ]);
    expect(res.stdout).toBe("OUT");
    expect(res.stderr).toBe("ERR");
  });

  it("runInherit reports success and failure on a real child", async () => {
    await expect(
      runInherit(process.execPath, ["-e", "0"]),
    ).resolves.toMatchObject({ failed: false, exitCode: 0 });
    await expect(
      runInherit(process.execPath, ["-e", "process.exit(2)"]),
    ).resolves.toMatchObject({ failed: true, exitCode: 2 });
  });
});

describe("runner: real PATH resolution", () => {
  it("finds the node binary and returns an absolute path", async () => {
    await expect(commandExists("node")).resolves.toBe(true);
    const path = await whichFirst("node");
    expect(path).toBeTruthy();
    expect(path).toMatch(/node(\.exe)?$/i);
  });

  it("reports a missing binary", async () => {
    await expect(
      commandExists("gup-definitely-not-a-real-binary"),
    ).resolves.toBe(false);
    await expect(
      whichFirst("gup-definitely-not-a-real-binary"),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Windows-only: the `.cmd` shim path
// ---------------------------------------------------------------------------

describe.runIf(process.platform === "win32")("runner: Windows .cmd shims", () => {
  let shim: string;

  beforeAll(async () => {
    // Same shape as the shims npm, pnpm, yarn, corepack and the cloud CLIs
    // install: a batch file that forwards its arguments to a real program.
    // Spawning one goes through cmd.exe, whose quoting rules execa 10
    // reimplemented — this is the exact path that changed.
    shim = join(dir, "argv-echo.cmd");
    await writeFile(
      shim,
      ["@ECHO off", `"${process.execPath}" "${echoScript}" %*`, ""].join("\r\n"),
      "utf8",
    );
  });

  it("round-trips plain arguments through a .cmd", async () => {
    const res = await run(shim, ["alpha", "beta"]);
    expect(res.failed).toBe(false);
    expect(JSON.parse(res.stdout)).toEqual(["alpha", "beta"]);
  });

  it("round-trips arguments containing spaces and quotes", async () => {
    const payload = ["with space", 'has"quote', "trailing\\"];
    const res = await run(shim, payload);
    expect(res.failed).toBe(false);
    expect(JSON.parse(res.stdout)).toEqual(payload);
  });

  it("does not let cmd.exe metacharacters escape the argument", async () => {
    // A caret, an ampersand or a percent-wrapped name reaching cmd.exe
    // unescaped would either run a second command or be substituted away.
    // Package ids really do contain these (winget ids, scoop buckets).
    const payload = ["a&b", "c^d", "%PATH%", "e|f", "g>h"];
    const res = await run(shim, payload);
    expect(res.failed).toBe(false);
    expect(JSON.parse(res.stdout)).toEqual(payload);
  });

  it("resolves a .cmd shim through PATH by bare name", async () => {
    const previous = process.env["PATH"];
    process.env["PATH"] = `${dir};${previous ?? ""}`;
    try {
      await expect(commandExists("argv-echo")).resolves.toBe(true);
      const res = await run("argv-echo", ["via-path"]);
      expect(res.failed).toBe(false);
      expect(JSON.parse(res.stdout)).toEqual(["via-path"]);
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
    }
  });
});
