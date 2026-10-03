import { describe, expect, it } from "vitest";
import { ComposerSelfProvider } from "../../../src/providers/dotnet-php/composer-self.js";
import { system } from "../../support/system/fake-system.js";
import { composerSelfMachine, PACKAGIST_COMPOSER_URL, packagistRoute } from "./php.cases.js";

/** The Composer binary, against the newest stable release Packagist lists. */

describe("ComposerSelfProvider.listOutdated", () => {
  it("takes the newest stable release, past dev branches and pre-releases", async () => {
    const versions = ["dev-main", "2.9.0-alpha1", "2.9.0-beta1", "2.9.0-RC1", "2.8.1", "2.8.0"];
    await system.load(composerSelfMachine(packagistRoute(versions)));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([
      { id: "composer-self", name: "Composer", current: "2.7.7", latest: "2.8.1" },
    ]);
  });

  it("lists nothing when Packagist lists no stable release", async () => {
    const versions = { a: { version: "dev-main" }, b: { version: "2.8.0-RC1" }, c: {} };
    const route = { url: PACKAGIST_COMPOSER_URL, json: { package: { versions } } };
    await system.load(composerSelfMachine(route));
    await expect(new ComposerSelfProvider().listOutdated()).resolves.toEqual([]);
  });
});
