import { describe, expect, it } from "vitest";
import { PnpmGlobalProvider } from "../../../src/providers/node/pnpm-global.js";
import { system } from "../../support/system/fake-system.js";
import { pnpmMachine } from "./node.cases.js";

/** `pnpm outdated --global --format json`: an object keyed by package. */

describe("PnpmGlobalProvider.listOutdated", () => {
  it("lists nothing for an empty report", async () => {
    await system.load(pnpmMachine("{}"));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });

  // pnpm 12 with its registry answering 503: nothing on stdout, exit 1, the
  // error on stderr in its boxed style — read as "nothing outdated" before.
  it("reports pnpm's own error as a scan error, not as nothing outdated", async () => {
    const stderr =
      'Error: ERR_PNPM_OUTDATED_REGISTRY_ERROR\n\n  × Failed to fetch metadata for "zx": GET' +
      " https://registry.npmjs.org/zx:\n  │ Service Unavailable - 503\n";
    await system.load(pnpmMachine("", stderr));
    await expect(new PnpmGlobalProvider().listOutdated()).rejects.toThrow(
      "pnpm outdated a échoué (ERR_PNPM_OUTDATED_REGISTRY_ERROR) : " +
        'Failed to fetch metadata for "zx": GET https://registry.npmjs.org/zx: ' +
        "Service Unavailable - 503",
    );
  });

  it("reads the one-line error of older pnpm releases too", async () => {
    const stderr = " ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/zx: connect ECONNREFUSED\n";
    await system.load(pnpmMachine("", stderr));
    await expect(new PnpmGlobalProvider().listOutdated()).rejects.toThrow(
      "pnpm outdated a échoué (ERR_PNPM_META_FETCH_FAIL) : GET https://registry.npmjs.org/zx: " +
        "connect ECONNREFUSED",
    );
  });

  it("keeps a report it can read, whatever pnpm said on stderr", async () => {
    const report = JSON.stringify({ zx: { current: "8.1.8", wanted: "8.1.8", latest: "8.2.0" } });
    await system.load(pnpmMachine(report, " WARN  ERR_PNPM_SOMETHING_MINOR  ignored\n"));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([
      { id: "zx", name: "zx", current: "8.1.8", latest: "8.2.0" },
    ]);
  });
});
