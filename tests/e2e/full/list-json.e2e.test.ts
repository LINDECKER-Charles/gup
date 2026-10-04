import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_PROVIDERS } from "../../../src/core/registry.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { saveArtifact } from "../../support/e2e/artifacts.js";
import { describeRun, runCli } from "../../support/e2e/cli.js";
import { parseDoctor, type DoctorGroups } from "../../support/e2e/doctor.js";
import { createSandbox, historyEvents, type Sandbox } from "../../support/e2e/sandbox.js";
import { assertScanResults } from "../../support/e2e/scan-schema.js";

/**
 * `gup list --json --fast` over every tool this machine really has: the
 * output keeps its published shape whatever the tools answer, only
 * providers `gup doctor` detects are scanned, the slow ones stay out, and
 * `--provider` narrows the scan. Read-only: a scan never changes anything
 * (its history record goes to the sandbox).
 */

const SCAN_TIMEOUT_MS = 300_000;
const SLOW_PROVIDERS = new Set(ALL_PROVIDERS.filter((p) => p.slow).map((p) => p.id));

let sandbox: Sandbox;
let doctor: DoctorGroups;

beforeAll(async () => {
  sandbox = await createSandbox("list");
  doctor = parseDoctor((await runCli(["doctor"], { sandbox })).stdout, process.platform);
});

afterAll(async () => {
  await sandbox.dispose();
});

async function listJson(args: readonly string[]): Promise<ProviderScanResult[]> {
  const fullArgs = ["list", "--json", ...args];
  const run = await runCli(fullArgs, { sandbox, timeoutMs: SCAN_TIMEOUT_MS });
  expect(run.code, describeRun(fullArgs, run)).toBe(0);
  const results: unknown = JSON.parse(run.stdout);
  assertScanResults(results);
  return results;
}

describe("gup list --json --fast, on this machine's real tools", () => {
  it(
    "scans the detected providers but the slow ones, in the published shape",
    async ({ annotate }) => {
      const results = await listJson(["--fast"]);
      await saveArtifact("list.json", JSON.stringify(results, null, 2));
      const ids = results.map((result) => result.providerId);

      expect(ids.filter((id) => !doctor.detected.includes(id))).toEqual([]);
      expect(ids.filter((id) => SLOW_PROVIDERS.has(id))).toEqual([]);
      const rows = results.reduce((total, result) => total + result.packages.length, 0);
      await annotate(`${ids.length} providers · ${rows} rows`);

      const scan = (await historyEvents(sandbox)).filter((event) => event.kind === "scan").at(-1);
      expect(scan).toMatchObject({ trigger: "cli", fast: true, filter: [] });
    },
    SCAN_TIMEOUT_MS,
  );

  it("narrows the scan to --provider", async () => {
    // npm, at least, is on any machine that runs these suites.
    const first = doctor.detected.find((id) => !SLOW_PROVIDERS.has(id));
    expect(first, "no provider detected here").toBeDefined();
    const results = await listJson(["--provider", first ?? ""]);
    expect(results.map((result) => result.providerId)).toEqual([first]);
  });
});
