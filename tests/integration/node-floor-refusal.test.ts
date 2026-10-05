import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { NODE_FLOOR_TEXT } from "../../src/core/node-floor.js";
import { gupVersion } from "../../src/core/version.js";
import { ERROR_LABELS } from "../../src/ui/text/cli-labels.js";
import { useLocale } from "../support/locale.js";

/**
 * The real entry point on a Node older than `MIN_NODE`: it stops with where
 * to get a newer Node, before the program loads — `--version` is never
 * answered. The older Node is faked by a preload that rewrites
 * `process.version(s)` before `cli.ts` runs; CI's `older node` job runs the
 * built package on a real one.
 */

const CLI = join(process.cwd(), "src", "cli.ts");
const OLDER_NODE = "24.11.0";
const AS_OLDER_NODE =
  "data:text/javascript," +
  `Object.defineProperty(process,"versions",{value:{...process.versions,node:"${OLDER_NODE}"}});` +
  `Object.defineProperty(process,"version",{value:"v${OLDER_NODE}"});`;
/** tsx start-up on a loaded Windows runner is the slow part, not gup. */
const SPAWN_TIMEOUT_MS = 30_000;

function gupVersionFlag(preloads: readonly string[], language: string) {
  return execa(process.execPath, ["--import", "tsx", ...preloads, CLI, "--version"], {
    env: { GUP_LANG: language, GUP_HISTORY: "0", GUP_CONFIG: "0", GUP_LOG_LEVEL: "off" },
    reject: false,
    timeout: SPAWN_TIMEOUT_MS,
  });
}

describe("gup on a Node older than its floor", () => {
  describe("in English", () => {
    useLocale("en");

    it(
      "exits 1 with the refusal on stderr, before the program answers anything",
      async () => {
        const result = await gupVersionFlag(["--import", AS_OLDER_NODE], "en");

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(
          `${ERROR_LABELS.prefix} ${NODE_FLOOR_TEXT.refusal(`v${OLDER_NODE}`)}`,
        );
      },
      SPAWN_TIMEOUT_MS * 2,
    );
  });

  describe("in French", () => {
    useLocale("fr");

    it(
      "speaks the language GUP_LANG names",
      async () => {
        const result = await gupVersionFlag(["--import", AS_OLDER_NODE], "fr");

        expect(result.stderr).toBe(
          `${ERROR_LABELS.prefix} ${NODE_FLOOR_TEXT.refusal(`v${OLDER_NODE}`)}`,
        );
      },
      SPAWN_TIMEOUT_MS * 2,
    );
  });

  it(
    "loads the program on the Node running the suite",
    async () => {
      const result = await gupVersionFlag([], "en");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(gupVersion());
    },
    SPAWN_TIMEOUT_MS * 2,
  );
});
