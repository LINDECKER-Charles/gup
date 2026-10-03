import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { routeInheritTo } from "../../src/core/process/inherit-sink.js";
import { detectEmbeddedTerminal } from "../../src/core/pty/pty-loader.js";
import { createPtySink, type PtyBackend } from "../../src/core/pty/pty-sink.js";
import type { TrampolineLocation } from "../../src/core/pty/trampoline.js";
import {
  runInherit,
  skipCurrent,
  type InheritOptions,
  type RunResult,
} from "../../src/core/runner.js";
import { childProcessesOf, eventually, isAlive } from "../support/pty/processes.js";
import { recordingPane, type RecordingPane } from "../support/pty/recording-pane.js";
import { bundleTrampoline, sourceTrampoline } from "../support/pty/trampoline-bundle.js";

/**
 * The embedded terminal end to end, on a real pseudo-terminal (ConPTY on
 * Windows): `runInherit` routed to the PTY sink starts the built trampoline
 * through node-pty, the trampoline runs the command through execa, and the
 * exit code, the output, the keyboard and the kill all make the round trip.
 *
 * Windows and macOS ship node-pty prebuilds, so there the embedded terminal
 * must be available: the first test fails instead of skipping. Linux builds
 * node-pty from source and may legitimately lack it — then the suite skips.
 */

const IS_WINDOWS = process.platform === "win32";
const IS_REQUIRED = IS_WINDOWS || process.platform === "darwin";
const SEQUENTIAL_SESSIONS = 20;
const SLOW_TEST_MS = 120_000;
/** How long a released pseudo-console and its drain worker may take to go away. */
const SETTLE_MS = 15_000;

const bundle = await bundleTrampoline();
const support = await detectEmbeddedTerminal({ locate: () => bundle.location });
const backend: PtyBackend | null = support.isAvailable ? support : null;

afterAll(async () => {
  await bundle.dispose();
});

interface PaneRun {
  readonly pane?: RecordingPane;
  readonly trampoline?: TrampolineLocation;
  readonly options?: InheritOptions;
}

/** `runInherit` with the PTY sink routed to one pane, as the run view does. */
async function runInPane(
  command: string,
  args: string[],
  run: PaneRun = {},
): Promise<{ readonly result: RunResult; readonly pane: RecordingPane }> {
  if (!backend) throw new Error("embedded terminal unavailable");
  const pane = run.pane ?? recordingPane();
  const sink = createPtySink(
    { pty: backend.pty, trampoline: run.trampoline ?? backend.trampoline },
    { current: () => pane },
  );
  const restore = routeInheritTo(sink);
  try {
    return { result: await runInherit(command, args, run.options), pane };
  } finally {
    restore();
  }
}

/** A node one-liner, the most portable "installer" there is. */
const node = (script: string): [string, string[]] => [process.execPath, ["-e", script]];

/** The pane's text without the VT control sequences ConPTY interleaves. */
function visibleText(pane: RecordingPane): string {
  return pane
    .text()
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

async function childPids(): Promise<Set<number>> {
  return new Set((await childProcessesOf(process.pid)).map((child) => child.pid));
}

/** Children of this process that were not there in `before`. */
async function newChildren(before: ReadonlySet<number>): Promise<string[]> {
  const children = await childProcessesOf(process.pid);
  return children.filter((child) => !before.has(child.pid)).map((child) => child.name);
}

const messagePorts = (): number =>
  process.getActiveResourcesInfo().filter((kind) => kind === "MessagePort").length;

/** Wait for `check`, then let the assertion that follows report what is still wrong. */
const settle = (check: () => boolean | Promise<boolean>): Promise<void> =>
  eventually(check, SETTLE_MS).catch(() => undefined);

describe("embedded terminal availability", () => {
  const mayBeMissing = !IS_REQUIRED && !support.isAvailable;
  it.skipIf(mayBeMissing)("loads node-pty and passes the spawn probe", () => {
    expect(support).toMatchObject({ isAvailable: true });
  });
});

describe.skipIf(!backend)("embedded terminal on a real pseudo-terminal", () => {
  it(
    `leaves no pseudo-console and no worker behind after ${SEQUENTIAL_SESSIONS} installs`,
    async () => {
      const before = await childPids();
      const portsBefore = messagePorts();

      for (let index = 0; index < SEQUENTIAL_SESSIONS; index++) {
        const { result } = await runInPane(...node(""));
        expect(result.exitCode).toBe(0);
      }

      await settle(async () => (await newChildren(before)).length === 0);
      expect(await newChildren(before)).toEqual([]);
      await settle(() => messagePorts() <= portsBefore);
      expect(messagePorts()).toBeLessThanOrEqual(portsBefore);
    },
    SLOW_TEST_MS,
  );

  it("shows the child's output in the pane", async () => {
    const { result, pane } = await runInPane(...node("console.log('bonjour depuis le pty')"));
    expect(result).toMatchObject({ exitCode: 0, failed: false });
    await settle(() => visibleText(pane).includes("bonjour depuis le pty"));
    expect(visibleText(pane)).toContain("bonjour depuis le pty");
  });

  const codes = IS_WINDOWS ? [0, 3010, 7, -1] : [0, 7, 42];
  it.each(codes)("reports exit code %i as the installer returned it", async (code) => {
    const { result } = await runInPane(...node(`process.exit(${code})`));
    expect(result).toMatchObject({ exitCode: code, failed: code !== 0 });
  });

  it("lets the user answer a prompt typed into the pane", async () => {
    const pane = recordingPane();
    const prompt =
      "process.stdout.write('Mot de passe : ');" +
      "process.stdin.once('data', (d) => {" +
      " console.log('recu:' + String(d).trim()); process.exit(5); });";
    const running = runInPane(...node(prompt), { pane });
    await eventually(() => visibleText(pane).includes("Mot de passe :"), SETTLE_MS);
    pane.type("abc\r");

    const { result } = await running;
    expect(result).toMatchObject({ exitCode: 5, failed: true });
    await settle(() => visibleText(pane).includes("recu:abc"));
    expect(visibleText(pane)).toContain("recu:abc");
  });

  it(
    "skipping an install takes its whole tree down",
    async () => {
      const before = await childPids();
      const pane = recordingPane();
      const sleeper = "console.log('pid:' + process.pid); setInterval(() => {}, 1000);";
      const running = runInPane(...node(sleeper), { pane });
      await eventually(() => /pid:\d+/.test(visibleText(pane)), SETTLE_MS);
      const installer = Number(/pid:(\d+)/.exec(visibleText(pane))![1]);
      expect(isAlive(installer)).toBe(true);

      expect(skipCurrent()).toBe(true);
      const { result } = await running;

      expect(result).toMatchObject({ aborted: true, failed: true });
      await settle(() => !isAlive(installer));
      expect(isAlive(installer)).toBe(false);
      await settle(async () => (await newChildren(before)).length === 0);
      expect(await newChildren(before)).toEqual([]);
    },
    SLOW_TEST_MS,
  );

  it("runs from the sources under tsx, as `npm run dev` does", async () => {
    const { result, pane } = await runInPane(...node("console.log('depuis les sources')"), {
      trampoline: sourceTrampoline(),
    });
    expect(result).toMatchObject({ exitCode: 0, failed: false });
    await settle(() => visibleText(pane).includes("depuis les sources"));
    expect(visibleText(pane)).toContain("depuis les sources");
  });
});

describe.skipIf(!backend || !IS_WINDOWS)("embedded terminal on ConPTY", () => {
  let dir: string | undefined;

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("resolves a .cmd shim by its bare name and passes its arguments intact", async () => {
    dir = await mkdtemp(join(tmpdir(), "gup-pty-shim-"));
    const echo = join(dir, "argv-echo.mjs");
    await writeFile(echo, "console.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    const shim = ["@ECHO off", `"${process.execPath}" "${echo}" %*`, ""].join("\r\n");
    await writeFile(join(dir, "argv-echo.cmd"), shim, "utf8");
    const previous = process.env["PATH"];
    process.env["PATH"] = `${dir};${previous ?? ""}`;
    try {
      const { result, pane } = await runInPane("argv-echo", ["a b", "c&d", "%PATH%"]);
      expect(result).toMatchObject({ exitCode: 0, failed: false });
      await settle(() => visibleText(pane).includes('["a b","c&d","%PATH%"]'));
      expect(visibleText(pane)).toContain('["a b","c&d","%PATH%"]');
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
    }
  });

  it("routes a shell request through cmd.exe", async () => {
    const shell = true;
    const { result } = await runInPane("exit", ["7"], { options: { shell } });
    expect(result).toMatchObject({ exitCode: 7, failed: true });
  });
});
