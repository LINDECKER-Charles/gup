import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { PROVIDER_ID_PATTERN, SCAN_SECTION } from "../../../src/core/config/scan-section.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { DEFAULT_UI_PREFERENCES } from "../../../src/ui/app/ui-preferences.js";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-scan-section-")), "config.json");
});

async function storeWith(scan: unknown): Promise<ConfigStore> {
  await writeFile(file, JSON.stringify({ version: 1, sections: { scan } }), "utf8");
  return new ConfigStore({ file });
}

describe("SCAN_SECTION", () => {
  it("defaults to the menu's own scan defaults", () => {
    const { fast, providerFilter } = SCAN_SECTION.defaults;
    expect({ fast, filter: providerFilter }).toEqual(DEFAULT_UI_PREFERENCES.scan);
  });

  it("reads the fast mode and the provider filter", async () => {
    const store = await storeWith({ v: 1, fast: true, providerFilter: ["npm-g", "R-packages"] });
    expect(store.read(SCAN_SECTION)).toEqual({ fast: true, providerFilter: ["npm-g", "R-packages"] });
  });

  it("drops ids that cannot be provider ids, keeps the others, once each", async () => {
    const store = await storeWith({
      v: 1,
      providerFilter: ["pip", "rm -rf /", "pip", "../x", 42, "-dash"],
    });
    expect(store.read(SCAN_SECTION).providerFilter).toEqual(["pip"]);
    expect(store.status().issues).toEqual(["scan.providerFilter : identifiants invalides ignorés"]);
  });

  it("matches every shape of id the registry uses", () => {
    for (const id of ["npm-g", "brew-cask", "R-packages", "dotnet-tools", "7zip"]) {
      expect(PROVIDER_ID_PATTERN.test(id), id).toBe(true);
    }
  });

  it("writes only what differs from the defaults", async () => {
    const store = new ConfigStore({ file });
    store.write(SCAN_SECTION, { ...SCAN_SECTION.defaults, fast: true });
    expect(JSON.parse(await readFile(file, "utf8")).sections).toEqual({ scan: { v: 1, fast: true } });
    store.write(SCAN_SECTION, SCAN_SECTION.defaults);
    expect(JSON.parse(await readFile(file, "utf8")).sections).toEqual({});
  });
});
