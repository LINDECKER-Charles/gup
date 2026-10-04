import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LOG_SECTION } from "../../../src/core/config/log-section.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { LOG_THRESHOLDS } from "../../../src/core/log/log.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const tempDir = useTempDirs();

let file: string;

beforeEach(async () => {
  file = join(await tempDir("gup-log-section-"), "config.json");
});

async function storeWith(log: unknown): Promise<ConfigStore> {
  await writeFile(file, JSON.stringify({ version: 1, sections: { log } }), "utf8");
  return new ConfigStore({ file });
}

describe("LOG_SECTION", () => {
  it("records from info by default", () => {
    expect(LOG_SECTION.defaults).toEqual({ level: "info" });
  });

  it.each(LOG_THRESHOLDS)("reads the level %s", async (level) => {
    const store = await storeWith({ v: 1, level });
    expect(store.read(LOG_SECTION).level).toBe(level);
  });

  it("falls back to the default on a value that is not a level, and says so", async () => {
    const store = await storeWith({ v: 1, level: "verbose" });
    expect(store.read(LOG_SECTION).level).toBe("info");
    expect(store.status().issues).toEqual([
      "log.level : une valeur parmi off, error, warn, info, debug, trace attendue",
    ]);
  });

  it("writes only a level that differs from the default", async () => {
    const store = new ConfigStore({ file });
    store.write(LOG_SECTION, { level: "debug" });
    expect(JSON.parse(await readFile(file, "utf8")).sections).toEqual({ log: { v: 1, level: "debug" } });
    store.write(LOG_SECTION, { level: "info" });
    expect(JSON.parse(await readFile(file, "utf8")).sections).toEqual({});
  });
});
