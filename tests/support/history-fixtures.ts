import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  HISTORY_SCHEMA_VERSION,
  type HistoryEnvelope,
  type HistoryEvent,
  type ScanEvent,
  type ScanProviderRecord,
  type UpdateEvent,
  type UpdateStatus,
} from "../../src/core/history/types.js";
import { pick, seededRandom } from "./random.js";

/**
 * Activity-history fixtures for the journal, insights and report suites:
 * single records with stable defaults, JSONL shards exactly as the store
 * writes them, and large deterministic histories for the performance bounds.
 */

export const FIXTURE_RUN_ID = "00000000-0000-4000-8000-000000000001";
export const FIXTURE_GUP_VERSION = "0.0.0-test";
export const FIXTURE_TS = "2026-10-01T09:00:00.000Z";

const MS_PER_DAY = 86_400_000;
const DEFAULT_DURATION_MS = 1_000;

function envelope(): Omit<HistoryEnvelope, "kind"> {
  return {
    v: HISTORY_SCHEMA_VERSION,
    ts: FIXTURE_TS,
    runId: FIXTURE_RUN_ID,
    gup: FIXTURE_GUP_VERSION,
    platform: "win32",
  };
}

/** A full scan; `outdated` defaults to the sum over `providers`, as the store computes it. */
export function scanEvent(overrides: Partial<Omit<ScanEvent, "kind">> = {}): ScanEvent {
  const providers: ScanProviderRecord[] = overrides.providers ?? [];
  return {
    ...envelope(),
    kind: "scan",
    durationMs: DEFAULT_DURATION_MS,
    fast: false,
    filter: [],
    providers,
    outdated: providers.reduce((total, provider) => total + provider.outdated, 0),
    ...overrides,
  };
}

/** A successful `1.0.0 → 2.0.0` update of `packageId` through `providerId`. */
export function updateEvent(
  providerId: string,
  packageId: string,
  overrides: Partial<Omit<UpdateEvent, "kind" | "providerId" | "packageId">> = {},
): UpdateEvent {
  return {
    ...envelope(),
    kind: "update",
    providerId,
    packageId,
    status: "success",
    from: "1.0.0",
    to: "2.0.0",
    durationMs: DEFAULT_DURATION_MS,
    ...overrides,
  };
}

/** One JSON record per line, newline-terminated: the store's format. */
export function toJsonl(events: readonly HistoryEvent[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

/** Events grouped into monthly shards (`2026-10.jsonl`, by the UTC month of `ts`). */
export function shardFiles(events: readonly HistoryEvent[]): ReadonlyMap<string, string> {
  const shards = new Map<string, HistoryEvent[]>();
  for (const event of events) {
    const name = `${new Date(event.ts).toISOString().slice(0, 7)}.jsonl`;
    shards.set(name, [...(shards.get(name) ?? []), event]);
  }
  return new Map([...shards].map(([name, shard]) => [name, toJsonl(shard)]));
}

/** Write the shards of `events` into `dir` (the test's own temp dir); returns their paths. */
export async function writeHistoryShards(
  dir: string,
  events: readonly HistoryEvent[],
): Promise<readonly string[]> {
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (const [name, content] of shardFiles(events)) {
    const file = join(dir, name);
    await writeFile(file, content, "utf8");
    files.push(file);
  }
  return files;
}

export interface SyntheticHistoryOptions {
  readonly events: number;
  readonly seed?: number;
  /** Instant of the first event. Default 2026-01-01T00:00:00Z. */
  readonly start?: Date;
  /** Days the events are spread over, evenly. Default 365. */
  readonly spanDays?: number;
  readonly providers?: readonly string[];
  readonly packagesPerProvider?: number;
}

/** One scan every this many events; the rest are updates. */
const SCAN_EVERY = 10;
/** Update outcomes drawn from this bag: 85 % successes, 10 % failures, 5 % skips. */
const STATUS_WEIGHTS: readonly UpdateStatus[] = [
  ...Array<UpdateStatus>(17).fill("success"),
  "failed",
  "failed",
  "skipped",
];
const MAX_UPDATE_MS = 60_000;
const MAX_SCAN_MS = 20_000;
const DEFAULT_PROVIDERS = ["winget", "npm-g", "pip", "scoop", "cargo"];
const DEFAULT_PACKAGES_PER_PROVIDER = 20;
const DEFAULT_START = new Date(Date.UTC(2026, 0, 1));
const DEFAULT_SPAN_DAYS = 365;

interface Generator {
  readonly random: () => number;
  readonly providers: readonly string[];
  readonly packagesPerProvider: number;
}

function syntheticUpdate(generator: Generator, ts: Date, index: number): UpdateEvent {
  const { random, providers, packagesPerProvider } = generator;
  const providerId = pick(random, providers);
  const packageNumber = Math.floor(random() * packagesPerProvider);
  return updateEvent(providerId, `${providerId}-pkg-${packageNumber}`, {
    ts: ts.toISOString(),
    runId: `run-${Math.floor(ts.getTime() / MS_PER_DAY)}`,
    status: pick(random, STATUS_WEIGHTS),
    from: `1.${index % 7}.0`,
    to: `1.${(index % 7) + 1}.0`,
    durationMs: Math.round(random() * MAX_UPDATE_MS),
  });
}

function syntheticScan(generator: Generator, ts: Date): ScanEvent {
  const providers = generator.providers.map((providerId) => ({
    providerId,
    outdated: Math.floor(generator.random() * generator.packagesPerProvider),
  }));
  return scanEvent({
    ts: ts.toISOString(),
    runId: `run-${Math.floor(ts.getTime() / MS_PER_DAY)}`,
    providers,
    durationMs: Math.round(generator.random() * MAX_SCAN_MS),
  });
}

/**
 * `options.events` events in ascending `ts`, the same for the same options on
 * every run and OS: one scan in ten, the rest updates over a fixed package set,
 * one run id per UTC day.
 */
export function syntheticHistory(options: SyntheticHistoryOptions): HistoryEvent[] {
  const generator: Generator = {
    random: seededRandom(options.seed ?? 1),
    providers: options.providers ?? DEFAULT_PROVIDERS,
    packagesPerProvider: options.packagesPerProvider ?? DEFAULT_PACKAGES_PER_PROVIDER,
  };
  const start = (options.start ?? DEFAULT_START).getTime();
  const stepMs = ((options.spanDays ?? DEFAULT_SPAN_DAYS) * MS_PER_DAY) / options.events;
  return Array.from({ length: options.events }, (_unused, index) => {
    const ts = new Date(start + Math.floor(index * stepMs));
    const isScan = index % SCAN_EVERY === 0;
    return isScan ? syntheticScan(generator, ts) : syntheticUpdate(generator, ts, index);
  });
}
