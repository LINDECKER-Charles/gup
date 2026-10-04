import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appFixture } from "../../../scripts/screenshots/fixtures/app-fixture.js";
import { FIXTURE_CLOCK } from "../../../scripts/screenshots/fixtures/clock.js";
import { ScreensRun } from "../../../scripts/screenshots/output/screens-run.js";
import type { SyncMode } from "../../../scripts/screenshots/output/sync-file.js";
import { enterSandbox } from "../../../scripts/screenshots/sandbox/env-sandbox.js";
import { freezeClock } from "../../../scripts/screenshots/sandbox/frozen-clock.js";
import type { Scene } from "../../../scripts/screenshots/scenes/scene.js";
import { SCENE_SIZES } from "../../../scripts/screenshots/scenes/sizes.js";

// The generator's setup, as scripts/screenshots/setup.ts installs it.
vi.mock("../../../src/core/runner.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "runner"),
);
vi.mock("../../../src/core/pty/pty-loader.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "ptyLoader",
  ),
);
vi.mock("../../../src/core/export/open-external.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(load, "opener"),
);
vi.mock("../../../src/core/scheduler/trigger/trigger-factory.js", async (load) =>
  (await import("../../../scripts/screenshots/sandbox/no-spawn.js")).guardedModule(
    load,
    "osTrigger",
  ),
);

/**
 * Two scenes on the real app and fixtures, waiting for fixture data only (a
 * provider, a package): the shipped catalogue follows the UI's strings and
 * keys, which other branches change; the generator's own run checks it.
 */
const SCENES: readonly Scene[] = [
  {
    id: "held-scan",
    title: "gup — Scan",
    alt: "A scan held midway.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture({ holdScan: { finished: 9, running: 2 } }),
    play: (stage) => stage.waitForText("PowerShell modules"),
  },
  {
    id: "scanned",
    title: "gup — Paquets",
    alt: "The packages a scan found.",
    size: SCENE_SIZES.default,
    fixture: () => appFixture(),
    play: (stage) => stage.waitForText("Visual Studio Code"),
  },
];

/**
 * Four captures per test at most, each allowed captureScene's 10 s wait: a
 * failing scene dumps its frame rather than timing out, and a loaded machine
 * gets the margin.
 */
const RUN_BUDGET_MS = 45_000;

let dir: string;
let leaveSandbox: () => void;
let thaw: () => void;

beforeEach(async () => {
  leaveSandbox = enterSandbox();
  thaw = freezeClock(FIXTURE_CLOCK.now);
  dir = await mkdtemp(join(tmpdir(), "gup-screens-run-"));
});

afterEach(async () => {
  thaw();
  leaveSandbox();
  await rm(dir, { recursive: true, force: true });
});

/** One full pass of the generator over `dir`; the status of every file it synced. */
async function generate(mode: SyncMode): Promise<string[]> {
  const run = new ScreensRun(dir, mode);
  const statuses: string[] = [];
  for (const scene of SCENES) statuses.push((await run.scene(scene)).status);
  statuses.push((await run.gallery([{ title: "Menu", scenes: SCENES }])).status);
  await run.orphans(SCENES);
  return statuses;
}

async function contents(): Promise<Record<string, string>> {
  const names = (await readdir(dir)).sort();
  const files = await Promise.all(names.map((name) => readFile(join(dir, name), "utf8")));
  return Object.fromEntries(names.map((name, index) => [name, files[index] ?? ""]));
}

describe("ScreensRun", { timeout: RUN_BUDGET_MS }, () => {
  it("renders byte-identical screenshots on consecutive runs", async () => {
    expect(await generate("write")).toEqual(["written", "written", "written"]);
    const first = await contents();
    expect(Object.keys(first)).toEqual(["README.md", "held-scan.svg", "scanned.svg"]);
    expect(await generate("write")).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(await contents()).toEqual(first);
  });

  it("fails in check mode on a stale, missing or orphan screenshot, and writes nothing", async () => {
    await generate("write");
    await writeFile(join(dir, "held-scan.svg"), "<svg/>\n");
    await rm(join(dir, "scanned.svg"));
    await writeFile(join(dir, "retired.svg"), "<svg/>\n");
    const [held, scanned] = SCENES as [Scene, Scene];
    const check = new ScreensRun(dir, "check");
    await expect(check.scene(held)).rejects.toThrow(
      "held-scan.svg is out of date — run `npm run screenshots` and commit the result.",
    );
    await expect(check.scene(scanned)).rejects.toThrow("scanned.svg is missing");
    await expect(check.orphans(SCENES)).rejects.toThrow("retired.svg no longer match any scene");
    expect(await contents()).toMatchObject({ "held-scan.svg": "<svg/>\n", "retired.svg": "<svg/>\n" });
    expect(Object.keys(await contents())).not.toContain("scanned.svg");
  });

  it("deletes in write mode the screenshots no scene produces any more", async () => {
    await writeFile(join(dir, "retired.svg"), "<svg/>\n");
    await expect(new ScreensRun(dir, "write").orphans(SCENES)).resolves.toEqual([
      join(dir, "retired.svg"),
    ]);
    expect(await readdir(dir)).toEqual([]);
  });
});
