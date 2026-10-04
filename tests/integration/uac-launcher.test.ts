import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type * as Runner from "../../src/core/runner.js";

/**
 * The UAC launcher on a real PowerShell: the script gup writes, run with the
 * paths it passes — minus the elevation. `-Verb RunAs` would raise a real UAC
 * prompt, so the test swaps it for `-NoNewWindow` (and refuses to run a
 * script it could not swap); everything else — PowerShell's parsing,
 * Start-Process joining `-ArgumentList`, node reading its argv — is real.
 *
 * The fake elevated child sits in a directory whose name holds a space, and
 * so does the batch file: an unquoted path reached the child split in two.
 */

const { runInheritMock } = vi.hoisted(() => ({ runInheritMock: vi.fn() }));
vi.mock("../../src/core/runner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Runner>()),
  runInherit: runInheritMock,
}));

const { runElevatedBatch } = await import("../../src/core/elevation.js");
const { run } = await vi.importActual<typeof Runner>("../../src/core/runner.js");

const RUN_AS = " -Verb RunAs";
const SAME_CONSOLE = " -NoNewWindow";
/** `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script> …` */
const SCRIPT_ARG_INDEX = 5;
const SPAWN_TIMEOUT_MS = 30_000;

/** Writes one outcome saying what argv it received, where the parent reads outcomes. */
const FAKE_CHILD = `
import { writeFileSync } from "node:fs";
const [command, inputFile] = process.argv.slice(2);
const isWhole = process.argv.length === 4 && command === "__admin-batch";
const outcome = { id: "a", success: isWhole, message: JSON.stringify(process.argv.slice(2)) };
writeFileSync(inputFile + ".out", JSON.stringify({ version: 1, outcomes: [outcome] }), { flag: "wx" });
`;

let root: string;
let fakeCli: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "gup uac launcher "));
  fakeCli = join(root, "fake cli.mjs");
  await writeFile(fakeCli, FAKE_CHILD, "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The launcher gup wrote, without its elevation, run for real. */
async function runWithoutElevation(command: string, args: string[]): Promise<Runner.RunResult> {
  const script = await readFile(args[SCRIPT_ARG_INDEX] ?? "", "utf8");
  if (!script.includes(RUN_AS)) throw new Error("launcher without -Verb RunAs: not run");
  const unelevated = join(root, "unelevated.ps1");
  await writeFile(unelevated, script.replace(RUN_AS, SAME_CONSOLE), "utf8");
  const swapped = args.map((arg, index) => (index === SCRIPT_ARG_INDEX ? unelevated : arg));
  return run(command, swapped);
}

describe.runIf(process.platform === "win32")("UAC launcher", () => {
  it("hands the elevated child each path whole, spaces included", async () => {
    runInheritMock.mockImplementation(runWithoutElevation);
    const previous = { cli: process.argv[1], temp: process.env["TEMP"], tmp: process.env["TMP"] };
    process.argv[1] = fakeCli;
    // os.tmpdir() reads TEMP on every call: the batch file lands under a space too.
    process.env["TEMP"] = root;
    process.env["TMP"] = root;
    try {
      const [outcome] = await runElevatedBatch(["choco:a"]);
      expect(outcome?.success).toBe(true);
      const argv = JSON.parse(outcome?.message ?? "[]") as string[];
      expect(argv[1]?.startsWith(root)).toBe(true);
    } finally {
      process.argv[1] = previous.cli ?? "";
      restoreEnv("TEMP", previous.temp);
      restoreEnv("TMP", previous.tmp);
    }
  });
}, SPAWN_TIMEOUT_MS);

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
