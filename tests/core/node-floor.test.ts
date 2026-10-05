import semver from "semver";
import { describe, expect, it } from "vitest";
import manifest from "../../package.json" with { type: "json" };
import { isSupportedNode, MIN_NODE, NODE_FLOOR_TEXT } from "../../src/core/node-floor.js";
import { SELF_UPDATE_COMMAND } from "../../src/core/self-update.js";
import tsupConfig from "../../tsup.config.js";
import { useLocale } from "../support/locale.js";

describe("the Node floor", () => {
  it.each(["26.9.0", "26.10.0", "27.0.0"])("runs on Node %s", (version) => {
    expect(isSupportedNode(version)).toBe(true);
  });

  it.each(["26.9.0-rc.1", "26.8.2", "24.11.0", "20.0.0"])("stops on Node %s", (version) => {
    expect(isSupportedNode(version)).toBe(false);
  });

  // Built for an older target, the bundle down-levels syntax every supported
  // Node runs natively; typed against older types, tsc accepts APIs the floor
  // lacks — or, newer, rejects nothing above it.
  it("is the major the build targets and the Node types describe", () => {
    const major = semver.major(MIN_NODE);

    expect(tsupConfig).toMatchObject({ target: `node${major}` });
    expect(semver.minVersion(manifest.devDependencies["@types/node"])?.major).toBe(major);
  });
});

describe("the refusal on an older Node", () => {
  describe("in English", () => {
    useLocale("en");

    it("names the floor and the running version, then where to get Node and how to reinstall", () => {
      expect(NODE_FLOOR_TEXT.refusal("v24.11.0")).toBe(
        "gup needs Node.js 26.9.0 or newer — current version v24.11.0\n" +
          "Install a newer Node.js: https://nodejs.org/en/download\n" +
          `Then reinstall gup: ${SELF_UPDATE_COMMAND}`,
      );
    });
  });

  describe("in French", () => {
    useLocale("fr");

    it("links nodejs.org's French download page", () => {
      expect(NODE_FLOOR_TEXT.refusal("v24.11.0")).toBe(
        "gup nécessite Node.js 26.9.0 ou plus récent — version actuelle v24.11.0\n" +
          "Installer une version plus récente de Node.js : https://nodejs.org/fr/download\n" +
          `Puis réinstaller gup : ${SELF_UPDATE_COMMAND}`,
      );
    });
  });
});
