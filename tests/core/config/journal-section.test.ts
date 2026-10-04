import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { JOURNAL_SECTION } from "../../../src/core/config/journal-section.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { PERIOD_CYCLE } from "../../../src/core/time/period.js";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-journal-section-")), "config.json");
});

async function storeWith(journal: unknown): Promise<ConfigStore> {
  await writeFile(file, JSON.stringify({ version: 1, sections: { journal } }), "utf8");
  return new ConfigStore({ file });
}

describe("JOURNAL_SECTION", () => {
  it("opens the Journal on 12 months and the HTML report in the browser by default", () => {
    expect(JOURNAL_SECTION.defaults).toEqual({ period: "12m", openReport: true });
  });

  it.each(PERIOD_CYCLE)("reads the period %s and the report switch", async (period) => {
    const store = await storeWith({ v: 1, period, openReport: false });
    expect(store.read(JOURNAL_SECTION)).toEqual({ period, openReport: false });
  });

  it("keeps a valid field when its neighbour is wrong, and says which one was", async () => {
    const store = await storeWith({ v: 1, period: "7d", openReport: false });
    expect(store.read(JOURNAL_SECTION)).toEqual({ period: "12m", openReport: false });
    expect(store.status().issues).toEqual([
      "journal.period : une valeur parmi 30d, 90d, 12m, all attendue",
    ]);
  });

  it("writes only what differs from the defaults", async () => {
    const store = new ConfigStore({ file });
    store.write(JOURNAL_SECTION, { period: "30d", openReport: true });
    expect(JSON.parse(await readFile(file, "utf8")).sections).toEqual({
      journal: { v: 1, period: "30d" },
    });
  });
});
