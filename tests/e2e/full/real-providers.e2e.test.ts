import { afterAll, describe, expect, it } from "vitest";
import { saveArtifact } from "../../support/e2e/artifacts.js";
import { describeRun, runCli } from "../../support/e2e/cli.js";
import { parseDoctor } from "../../support/e2e/doctor.js";
import { createSandbox } from "../../support/e2e/sandbox.js";
import { assertScanResults } from "../../support/e2e/scan-schema.js";

/**
 * Drift against the real tools: every provider `gup doctor` detects on this
 * machine is scanned alone (`gup list --json --provider <id>`), slow ones
 * included. Whatever the installed version of a tool prints today, the
 * provider must stay fail-soft — return its rows, or none — never surface a
 * scan error: that would be a parser out of step with the tool. Read-only.
 */

/** One provider's scan, its detection pass included (the 60 s cap of the testing spec). */
const PROVIDER_TIMEOUT_MS = 60_000;

const sandbox = await createSandbox("providers");
const doctor = await runCli(["doctor"], { sandbox });
const detected = parseDoctor(doctor.stdout, process.platform).detected;

afterAll(async () => {
  await sandbox.dispose();
});

describe("every provider detected here, scanned alone", () => {
  it("finds providers to scan", () => {
    expect(detected.length, describeRun(["doctor"], doctor)).toBeGreaterThan(0);
  });

  it.concurrent.for(detected)(
    "%s scans without an error",
    { timeout: PROVIDER_TIMEOUT_MS + 10_000 },
    async (providerId, { expect: expectHere }) => {
      const args = ["list", "--json", "--provider", providerId];
      const run = await runCli(args, { sandbox, timeoutMs: PROVIDER_TIMEOUT_MS });
      expectHere(run.code, describeRun(args, run)).toBe(0);
      const results: unknown = JSON.parse(run.stdout);
      assertScanResults(results);
      await saveArtifact(`providers/${providerId}.json`, run.stdout);

      expectHere(results.map((result) => result.providerId)).toEqual([providerId]);
      expectHere(results[0]?.error, `${providerId} reported a scan error`).toBeUndefined();
    },
  );
});
