import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeInheritTo } from "../../src/core/process/inherit-sink.js";
import { detectEmbeddedTerminal } from "../../src/core/pty/pty-loader.js";
import { createPtySink } from "../../src/core/pty/pty-sink.js";
import { run, runInherit } from "../../src/core/runner.js";
import { recordingPane } from "../support/pty/recording-pane.js";
import { bundleTrampoline } from "../support/pty/trampoline-bundle.js";

/**
 * Package ids and versions reach gup's commands as data — a winget id, a
 * scoop bucket, a version a registry returned. They must reach the child
 * process as exactly one argv entry each, byte for byte, through every path
 * an install can take: the runner's own spawn, and the embedded terminal,
 * where the request travels through the pty-exec trampoline first. A shell
 * anywhere on the way would split, substitute or expand them.
 */

/** What a shell would act on: separators, quotes, substitutions, globs, redirections. */
const METACHARACTERS = [
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

/** Variable syntax of both shells families. */
const VARIABLES = ["$HOME", "%USERPROFILE%", "${PATH}", "%PATH%"];

const PAYLOADS = [
  ["shell metacharacters", METACHARACTERS],
  ["environment-variable syntax", VARIABLES],
] as const;

/** Real processes, and the embedded terminal's probe: generous on a loaded CI runner. */
const SPAWN_TIMEOUT_MS = 30_000;

let dir: string;
/** Writes its argv (after the output path) as JSON to the file named by its first argument. */
let argvRecorder: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-argv-"));
  argvRecorder = join(dir, "argv-recorder.mjs");
  const script =
    'import { writeFileSync } from "node:fs";\n' +
    "writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));\n";
  await writeFile(argvRecorder, script, "utf8");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

let recordings = 0;

/** Run the recorder with `args` through `spawn`, and read back the argv it received. */
async function received(
  spawn: (command: string, args: string[]) => Promise<{ readonly failed: boolean }>,
  args: readonly string[],
): Promise<string[]> {
  const output = join(dir, `argv-${++recordings}.json`);
  const result = await spawn(process.execPath, [argvRecorder, output, ...args]);
  expect(result.failed).toBe(false);
  return JSON.parse(await readFile(output, "utf8")) as string[];
}

describe("runner argv hardening", () => {
  it.each(PAYLOADS)("passes %s as literal argv entries", async (_label, payload) => {
    await expect(received(run, payload)).resolves.toEqual(payload);
  });
}, SPAWN_TIMEOUT_MS);

const bundle = await bundleTrampoline();
const terminal = await detectEmbeddedTerminal({ locate: () => bundle.location });

afterAll(async () => {
  await bundle.dispose();
});

/**
 * Windows and macOS ship node-pty prebuilds, so the embedded terminal is there
 * on those legs; Linux may lack a toolchain to build it (tests/integration
 * asserts the availability itself).
 */
describe.skipIf(!terminal.isAvailable)("embedded terminal argv hardening", () => {
  /** `runInherit` routed to the PTY sink, as the run view routes every install. */
  async function throughTerminal(command: string, args: string[]) {
    if (!terminal.isAvailable) throw new Error("embedded terminal unavailable");
    const pane = recordingPane();
    const restore = routeInheritTo(
      createPtySink({ pty: terminal.pty, trampoline: terminal.trampoline }, { current: () => pane }),
    );
    try {
      return await runInherit(command, args);
    } finally {
      restore();
    }
  }

  it.each(PAYLOADS)("passes %s through the trampoline intact", async (_label, payload) => {
    await expect(received(throughTerminal, payload)).resolves.toEqual(payload);
  });
}, SPAWN_TIMEOUT_MS);
