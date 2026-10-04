import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UpdateEvent } from "../../../src/core/history/types.js";
import { CONFIRM_UPDATE, VIEW_LABELS } from "../../../src/ui/text/menu-labels.js";
import { PACKAGES_PLACEHOLDERS, SELECTION_BAR } from "../../../src/ui/text/packages-labels.js";
import { RUN_SUMMARY, RUN_TITLES } from "../../../src/ui/text/run-labels.js";
import { saveArtifact } from "../../support/e2e/artifacts.js";
import { describeRun, runCli } from "../../support/e2e/cli.js";
import { installedVersion, installGlobal, latestVersion } from "../../support/e2e/npm-prefix.js";
import { detectTerminal, PtySession } from "../../support/e2e/pty-session.js";
import {
  createSandbox,
  historyEvents,
  restrictMenuScan,
  type Sandbox,
} from "../../support/e2e/sandbox.js";
import { assertScanResults } from "../../support/e2e/scan-schema.js";
import { isMutateEnabled } from "../../support/e2e/scope.js";

/**
 * A real update, end to end, that touches nothing but a throw-away npm
 * prefix (GUP_MUTATE=1): an old `is-number` is installed there, gup finds it
 * outdated and updates it to the registry's latest — once through
 * `gup update`, once through the menu's run view and its embedded terminal —
 * and each attempt lands in the sandbox's history. The machine's own global
 * packages are never listed nor touched, and PATH is left as it is.
 */

const terminal = await detectTerminal();
const PACKAGE = "is-number";
const OLD_VERSION = "6.0.0";
const TARGET = `npm-g:${PACKAGE}`;
/** npm reaching the registry, on a cold cache, on a busy runner. */
const UPDATE_TIMEOUT_MS = 240_000;
/** What `gup update` prints once every install succeeded (update-console.ts). */
const CLI_SUCCESS = "OK   1 mise(s) à jour effectuée(s)";

let sandbox: Sandbox;
let latest: string;
let session: PtySession | null = null;

beforeAll(async () => {
  sandbox = await createSandbox("update");
  restrictMenuScan(sandbox, ["npm-g"]);
  latest = await latestVersion(sandbox, PACKAGE);
});

afterEach(async ({ task }) => {
  if (session && task.result?.state === "fail") {
    await saveArtifact(`screens/${task.name}.txt`, (await session.screen()).text);
  }
  await session?.dispose();
  session = null;
});

afterAll(async () => {
  await sandbox.dispose();
});

/** The last update gup recorded for the package. */
async function lastUpdate(): Promise<UpdateEvent | undefined> {
  const updates = (await historyEvents(sandbox)).filter(
    (event): event is UpdateEvent => event.kind === "update" && event.packageId === PACKAGE,
  );
  return updates.at(-1);
}

describe.runIf(isMutateEnabled())("a real update in a throw-away npm prefix", { retry: 0 }, () => {
  beforeEach(async () => {
    await installGlobal(sandbox, [`${PACKAGE}@${OLD_VERSION}`]);
  }, UPDATE_TIMEOUT_MS);

  it(
    "gup update installs the latest release and records the attempt",
    async ({ annotate }) => {
      const list = await runCli(["list", "--json", "--provider", "npm-g"], { sandbox });
      const results: unknown = JSON.parse(list.stdout);
      assertScanResults(results);
      expect(results[0]?.packages).toEqual([
        expect.objectContaining({ id: PACKAGE, current: OLD_VERSION, latest }),
      ]);

      const args = ["update", TARGET, "--yes"];
      const run = await runCli(args, { sandbox, timeoutMs: UPDATE_TIMEOUT_MS });
      expect(run.code, describeRun(args, run)).toBe(0);
      expect(run.stdout).toContain(CLI_SUCCESS);
      expect(await installedVersion(sandbox, PACKAGE)).toBe(latest);
      // A named target is updated without a scan, so its record has no from/to
      // (the menu's has: see the next test).
      expect(await lastUpdate()).toMatchObject({
        providerId: "npm-g",
        status: "success",
        trigger: "cli",
      });
      await annotate(`gup update ${PACKAGE} ${OLD_VERSION} → ${latest} in ${run.ms} ms`);
    },
    UPDATE_TIMEOUT_MS,
  );

  it.skipIf(!terminal.isAvailable)(
    "the menu updates it in its run view, then prunes it from Paquets",
    async ({ annotate }) => {
      if (!terminal.isAvailable) return;
      const menu = (session = PtySession.start(terminal.pty, sandbox));
      await menu.waitForText(` ${PACKAGE} `);
      await menu.waitForText(`┏━ ${VIEW_LABELS.packages}`);
      await menu.type("a");
      await menu.waitForText(SELECTION_BAR.count(1, 1));
      await menu.press("enter");
      await menu.waitForText(CONFIRM_UPDATE.heading(1));
      await menu.type("o");

      const results = await menu.waitForText(RUN_TITLES.done, UPDATE_TIMEOUT_MS);
      expect(results.text).toContain(RUN_SUMMARY.succeeded(1));
      await menu.press("enter");
      await menu.waitForText(`┏━ ${VIEW_LABELS.packages}`);
      await menu.waitForText(PACKAGES_PLACEHOLDERS.upToDate);

      expect(await installedVersion(sandbox, PACKAGE)).toBe(latest);
      expect(await lastUpdate()).toMatchObject({
        status: "success",
        from: OLD_VERSION,
        to: latest,
        trigger: "menu",
      });
      await menu.type("q");
      expect(await menu.exited()).toBe(0);
      await annotate(`menu run view ${PACKAGE} ${OLD_VERSION} → ${latest}`);
    },
    UPDATE_TIMEOUT_MS,
  );
});
