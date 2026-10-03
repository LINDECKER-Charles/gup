/**
 * Child process of store-concurrency.test.ts: increments the counter of one
 * section `rounds` times through ConfigStore.update(), as a second gup would.
 * Usage: node --import tsx concurrent-writer.ts <file> <section-key> <rounds>
 */
import { defineSection } from "../../../src/core/config/section.js";
import { ConfigStore } from "../../../src/core/config/store.js";

const [file, key, rounds] = process.argv.slice(2);
if (!file || !key || !rounds) throw new Error("usage: concurrent-writer <file> <section-key> <rounds>");

const COUNTER = defineSection({
  key,
  version: 1,
  defaults: { count: 0 },
  parse: (read) => ({ count: read.integer("count", { min: 0, max: Number.MAX_SAFE_INTEGER }, 0) }),
});

const store = new ConfigStore({ file });
for (let round = 0; round < Number(rounds); round++) {
  store.update(COUNTER, (current) => ({ count: current.count + 1 }));
}
