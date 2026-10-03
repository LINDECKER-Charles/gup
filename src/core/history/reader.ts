import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { stateDir } from "../state/app-dirs.js";
import { isWithin, type Period } from "../time/period.js";
import { parseHistoryLine } from "./parse-event.js";
import type { HistoryEvent } from "./types.js";

/**
 * Reading the activity history back, for display and export only — the
 * journal view, `gup report`, the diagnostic archive. What it returns never
 * feeds a decision (which package to update, whether a schedule is due): a
 * guard test keeps it imported by those front-ends alone.
 *
 * Content never makes it throw. A torn line (a process killed mid-append), a
 * hand-edited one or a newer gup's record is counted and skipped; only I/O
 * errors propagate, and a missing directory is an empty history.
 */

export interface HistoryReadStats {
  /** Monthly shards read. */
  readonly files: number;
  /** Non-empty lines read, kept or not. */
  readonly lines: number;
  /** Lines that are not records gup wrote. */
  readonly malformed: number;
  /** Records from a newer gup this reader cannot interpret. */
  readonly unsupported: number;
}

export interface HistoryRead {
  readonly dir: string | null;
  /** The records within the period, oldest first. */
  readonly events: readonly HistoryEvent[];
  readonly stats: HistoryReadStats;
}

/** `2026-10.jsonl`: one shard per UTC month, as `paths.ts` names them. */
const SHARD_NAME = /^(\d{4})-(\d{2})\.jsonl$/;
const BYTE_ORDER_MARK = "﻿";
const LINE_BREAK = /\r?\n/;

interface Tally {
  lines: number;
  malformed: number;
  unsupported: number;
}

interface TimedEvent {
  readonly event: HistoryEvent;
  readonly at: number;
}

export async function readHistory(
  period: Period,
  dir: string | null = stateDir("history"),
): Promise<HistoryRead> {
  const shards = dir === null ? [] : await shardsOverlapping(dir, period);
  const tally: Tally = { lines: 0, malformed: 0, unsupported: 0 };
  const timed: TimedEvent[] = [];
  for (const shard of shards) {
    collect(await readFile(shard, "utf8"), { period, tally, into: timed });
  }
  // Concurrent processes (the elevated child and its parent) may interleave
  // their appends: order by instant, the earlier record first on a tie.
  timed.sort((a, b) => a.at - b.at);
  return {
    dir,
    events: timed.map(({ event }) => event),
    stats: { files: shards.length, ...tally },
  };
}

/** The shard files of `dir` whose UTC month meets the period, oldest first. */
async function shardsOverlapping(dir: string, period: Period): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && monthMeets(entry.name, period))
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(dir, name));
}

function monthMeets(name: string, period: Period): boolean {
  const parts = SHARD_NAME.exec(name);
  if (!parts) return false;
  const [year, month] = [Number(parts[1]), Number(parts[2])];
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  const isAfterSince = period.since === null || end > period.since.getTime();
  return isAfterSince && start <= period.until.getTime();
}

interface Collector {
  readonly period: Period;
  readonly tally: Tally;
  readonly into: TimedEvent[];
}

function collect(content: string, { period, tally, into }: Collector): void {
  const text = content.startsWith(BYTE_ORDER_MARK) ? content.slice(1) : content;
  for (const line of text.split(LINE_BREAK)) {
    if (line.length === 0) continue;
    tally.lines += 1;
    const parsed = parseHistoryLine(line);
    if (parsed.kind === "malformed") tally.malformed += 1;
    else if (parsed.kind === "unsupported") tally.unsupported += 1;
    else {
      const at = Date.parse(parsed.event.ts);
      if (isWithin(period, at)) into.push({ event: parsed.event, at });
    }
  }
}
