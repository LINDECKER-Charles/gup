import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import manifest from "../../../package.json" with { type: "json" };
import { isSupportedOn } from "../../../src/core/platform/is-supported-on.js";
import { ALL_PROVIDERS } from "../../../src/core/registry.js";
import { TARGET_MESSAGES } from "../../../src/core/scheduler/model/schedule-target.js";
import type { Provider } from "../../../src/core/types.js";
import { TERMINAL_DIAGNOSTIC } from "../../../src/ui/text/run-labels.js";
import { SCHEDULE_CLI_LABELS } from "../../../src/ui/text/schedule/schedule-cli-labels.js";
import { describeRun, runCli, type CliRun } from "../../support/e2e/cli.js";
import { parseDoctor } from "../../support/e2e/doctor.js";
import { createSandbox, historyEvents, type Sandbox } from "../../support/e2e/sandbox.js";
import { assertScanResults } from "../../support/e2e/scan-schema.js";
import { isPtyRequired } from "../../support/e2e/scope.js";

/**
 * The built CLI's non-interactive surface, on the machine it runs on, inside
 * a sandbox: nothing here needs the network or scans a real tool other than
 * npm on an empty global prefix, so it runs on every pull request, on every
 * OS.
 */

const COMMANDS = ["list", "update", "doctor", "log", "report", "schedule"];
const HIDDEN_COMMANDS = ["__admin-batch", "__schedule-tick"];
const MECHANISMS: Partial<Record<NodeJS.Platform, string>> = {
  win32: "windows-task",
  darwin: "launchd",
  linux: "crontab",
};

let sandbox: Sandbox;

beforeAll(async () => {
  sandbox = await createSandbox("smoke");
});

afterAll(async () => {
  await sandbox.dispose();
});

async function gup(args: readonly string[], input?: string): Promise<CliRun> {
  return runCli(args, { sandbox, ...(input !== undefined && { input }) });
}

function expectExit(args: readonly string[], run: CliRun, code: number): void {
  expect(run.code, describeRun(args, run)).toBe(code);
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

describe("gup, from the command line", () => {
  it("prints the version package.json declares", async () => {
    const run = await gup(["--version"]);
    expectExit(["--version"], run, 0);
    expect(run.stdout.trim()).toBe(manifest.version);
  });

  it("lists every public command in its help, and none of the internal ones", async () => {
    const run = await gup(["--help"]);
    expectExit(["--help"], run, 0);
    for (const command of COMMANDS) {
      expect(run.stdout).toMatch(new RegExp(`^\\s+${command}\\b`, "m"));
    }
    for (const hidden of HIDDEN_COMMANDS) expect(run.stdout).not.toContain(hidden);
  });

  it("refuses an unknown command", async () => {
    const run = await gup(["nope"]);
    expectExit(["nope"], run, 1);
    expect(run.stderr).toContain("nope");
  });

  it("refuses a target without a provider (exit 2)", async () => {
    const run = await gup(["update", "nope"]);
    expectExit(["update", "nope"], run, 2);
    expect(run.stderr + run.stdout).toContain("Format invalide");
  });

  it("explains, without a terminal, that the menu needs one", async () => {
    const run = await gup([], "q\n");
    expectExit([], run, 1);
    expect(run.stderr).toContain("cette action demande un terminal interactif");
  });
});

describe("gup doctor", () => {
  let doctor: CliRun;

  beforeAll(async () => {
    doctor = await gup(["doctor"]);
  });

  it("puts every registered provider in the group this OS gives it, then exits 0", async ({
    annotate,
  }) => {
    expectExit(["doctor"], doctor, 0);
    const groups = parseDoctor(doctor.stdout, process.platform);
    const isHere = (provider: Provider): boolean => isSupportedOn(provider);
    const supported = ALL_PROVIDERS.filter(isHere).map((provider) => provider.id);
    const foreign = ALL_PROVIDERS.filter((provider) => !isHere(provider)).map((p) => p.id);

    expect(sorted(groups.incompatible)).toEqual(sorted(foreign));
    expect(sorted([...groups.detected, ...groups.missing])).toEqual(sorted(supported));
    await annotate(
      `doctor ${(doctor.ms / 1000).toFixed(1)} s · ${groups.detected.length} detected · ` +
        `${groups.incompatible.length} incompatible`,
    );
  });

  it("closes on the system section, the embedded terminal included", () => {
    expect(doctor.stdout).toMatch(new RegExp(`${TERMINAL_DIAGNOSTIC.label}\\s+\\S`));
  });

  it.runIf(isPtyRequired())("finds the embedded terminal it needs on this OS", () => {
    const line = doctor.stdout
      .split(/\r?\n/)
      .find((text) => text.includes(TERMINAL_DIAGNOSTIC.label));
    expect(line, describeRun(["doctor"], doctor)).toContain(TERMINAL_DIAGNOSTIC.available);
  });
});

describe("gup list --json", () => {
  const args = ["list", "--json", "--fast", "--provider", "npm-g"];

  it("prints scan results in the published shape and records the scan", async () => {
    const run = await gup(args);
    expectExit(args, run, 0);
    const results: unknown = JSON.parse(run.stdout);
    assertScanResults(results);
    // npm is on every runner, and the sandbox's global prefix holds nothing.
    expect(results).toEqual([{ providerId: "npm-g", available: true, packages: [] }]);

    const scans = (await historyEvents(sandbox)).filter((event) => event.kind === "scan");
    expect(scans.at(-1)).toMatchObject({ trigger: "cli", fast: true, filter: ["npm-g"] });
  });
});

describe("gup report", () => {
  it("writes a self-contained HTML report and opens nothing", async () => {
    const out = join(sandbox.root, "report.html");
    const args = ["report", "--since", "all", "--out", out, "--no-open"];
    const run = await gup(args);
    expectExit(args, run, 0);

    const html = await readFile(out, "utf8");
    const policy = /<meta http-equiv="Content-Security-Policy" content="[^"]*default-src 'none'/;
    expect(html).toMatch(policy);
    // Nothing the page refers to may come from the network.
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
  });

  it("exports the history as JSON on stdout", async () => {
    const args = ["report", "--format", "json", "--since", "all", "--out", "-"];
    const run = await gup(args);
    expectExit(args, run, 0);
    expect(() => JSON.parse(run.stdout) as unknown).not.toThrow();
  });
});

describe("gup schedule", () => {
  it("says there is nothing scheduled yet", async () => {
    const run = await gup(["schedule", "list"]);
    expectExit(["schedule", "list"], run, 0);
    expect(run.stdout).toContain(SCHEDULE_CLI_LABELS.noSchedule);
  });

  it("reports an empty list and no trigger as JSON", async () => {
    const list = await gup(["schedule", "list", "--json"]);
    expectExit(["schedule", "list", "--json"], list, 0);
    expect(JSON.parse(list.stdout)).toMatchObject({ trigger: { installed: false }, schedules: [] });

    const status = await gup(["schedule", "status", "--json"]);
    expectExit(["schedule", "status", "--json"], status, 0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      installed: false,
      enabledCount: 0,
      mechanism: MECHANISMS[process.platform] ?? null,
    });
  });

  // Twice invalid on purpose — a whole provider and an impossible time: an
  // accepted schedule would register the user's real OS trigger.
  it("refuses an invalid schedule and saves nothing (exit 2)", async () => {
    const args = ["schedule", "add", "npm-g", "--every", "daily", "--at", "25:99"];
    const run = await gup(args);
    expectExit(args, run, 2);
    expect(run.stderr).toContain(TARGET_MESSAGES.neverAProvider);
    const list = await gup(["schedule", "list", "--json"]);
    expect(JSON.parse(list.stdout)).toMatchObject({ schedules: [] });
  });
});
