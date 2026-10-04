import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { historyLocation } from "../../../../src/core/history/paths.js";
import type { HistoryEvent } from "../../../../src/core/history/types.js";
import { fixtureDays } from "./fixture-days.js";
import { scanHistory } from "./scan-history.js";
import { updateHistory } from "./update-history.js";

/**
 * The fixture machine's year of activity, oldest first: every scan and every
 * update attempt, as gup recorded them. Pure: the same `now` always gives
 * the same records (no randomness, no clock read).
 */
function historyFixture(now: Date): HistoryEvent[] {
  const days = fixtureDays(now);
  return [...scanHistory(days), ...updateHistory(days)].sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Write {@link historyFixture} where gup reads its history
 * (`GUP_HISTORY_DIR`, the sandbox in the generator), one shard per month as
 * the store writes them — through `historyLocation`, the store's own
 * naming. Each shard is written whole: writing it again changes nothing.
 */
export function writeHistoryFixture(now: Date): void {
  const shards = new Map<string, string[]>();
  for (const event of historyFixture(now)) {
    const location = historyLocation(new Date(event.ts));
    if (!location) throw new Error("the history fixture has nowhere to go: no history directory");
    const lines = shards.get(location.file) ?? [];
    lines.push(JSON.stringify(event));
    shards.set(location.file, lines);
  }
  for (const [file, lines] of shards) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
  }
}
