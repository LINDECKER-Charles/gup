import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HistoryEvent, ScanEvent, UpdateEvent } from "../../src/core/history/types.js";
import type { ProviderScanResult, UpdateOutcome } from "../../src/core/types.js";

/**
 * The store keeps two pieces of module state — the per-process run id and the
 * "already warned" latch — so every test re-imports it fresh. Writes go to a
 * throwaway directory pointed at by GUP_HISTORY_DIR; nothing here touches the
 * real user profile.
 */
type Store = typeof import("../../src/core/history/store.js");

let store: Store;
let dir: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

const SHARD = `${new Date().toISOString().slice(0, 7)}.jsonl`;

function readEvents(): HistoryEvent[] {
  const raw = readFileSync(join(dir, SHARD), "utf8");
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as HistoryEvent);
}

function scanResult(over: Partial<ProviderScanResult> = {}): ProviderScanResult {
  return {
    providerId: over.providerId ?? "npm-global",
    available: over.available ?? true,
    packages: over.packages ?? [],
    ...(over.error !== undefined && { error: over.error }),
  };
}

function outcome(over: Partial<UpdateOutcome> = {}): UpdateOutcome {
  return { id: over.id ?? "typescript", success: over.success ?? true, ...over };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "gup-history-"));
  process.env["GUP_HISTORY_DIR"] = dir;
  process.env["GUP_HISTORY"] = "1";
  stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.resetModules();
  store = await import("../../src/core/history/store.js");
});

afterEach(() => {
  stderrSpy.mockRestore();
  delete process.env["GUP_HISTORY_DIR"];
  process.env["GUP_HISTORY"] = "0";
  rmSync(dir, { recursive: true, force: true });
});

describe("recordUpdate", () => {
  it("appends one JSONL line carrying the shared envelope", () => {
    store.recordUpdate({ providerId: "npm-global", outcome: outcome() });

    const events = readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      v: 1,
      kind: "update",
      providerId: "npm-global",
      packageId: "typescript",
      status: "success",
      platform: process.platform,
    });
    expect(Date.parse(events[0]!.ts)).not.toBeNaN();
    expect(events[0]!.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps every record of a run under the same runId", () => {
    store.recordUpdate({ providerId: "p", outcome: outcome({ id: "a" }) });
    store.recordUpdate({ providerId: "p", outcome: outcome({ id: "b" }) });

    const events = readEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.runId).toBe(events[1]!.runId);
  });

  it("separates skipped from failed", () => {
    store.recordUpdate({
      providerId: "p",
      outcome: outcome({ id: "a", success: false, skipped: true, message: "manuel" }),
    });
    store.recordUpdate({
      providerId: "p",
      outcome: outcome({ id: "b", success: false, message: "boom" }),
    });

    const events = readEvents() as UpdateEvent[];
    expect(events[0]).toMatchObject({ status: "skipped", message: "manuel" });
    expect(events[1]).toMatchObject({ status: "failed", message: "boom" });
  });

  it("records the version delta, the duration and the retry/elevated flags", () => {
    store.recordUpdate({
      providerId: "winget",
      outcome: outcome({ id: "Foo.Bar" }),
      pkg: { id: "Foo.Bar", current: "1.0.0", latest: "1.2.0" },
      durationMs: 1234.6,
      retry: "retry --force",
      elevated: true,
    });

    expect(readEvents()[0]).toMatchObject({
      from: "1.0.0",
      to: "1.2.0",
      durationMs: 1235,
      retry: "retry --force",
      elevated: true,
    });
  });

  it("omits the optional fields it was not given", () => {
    store.recordUpdate({ providerId: "p", outcome: outcome() });

    const event = readEvents()[0] as UpdateEvent;
    expect(event).not.toHaveProperty("from");
    expect(event).not.toHaveProperty("retry");
    expect(event).not.toHaveProperty("elevated");
    expect(event).not.toHaveProperty("message");
  });
});

describe("recordScan", () => {
  it("summarises the run per provider and totals the outdated count", () => {
    store.recordScan({
      durationMs: 4200,
      results: [
        scanResult({
          providerId: "npm-global",
          packages: [{ id: "a", current: "1", latest: "2" }],
        }),
        scanResult({ providerId: "scoop", error: "scan failed" }),
      ],
      options: { fast: true, only: ["npm-global", "scoop"] },
    });

    expect(readEvents()[0]).toMatchObject({
      kind: "scan",
      durationMs: 4200,
      fast: true,
      filter: ["npm-global", "scoop"],
      outdated: 1,
      providers: [
        { providerId: "npm-global", outdated: 1 },
        { providerId: "scoop", outdated: 0, error: "scan failed" },
      ],
    });
  });

  it("defaults to a full, unfiltered scan when no options are passed", () => {
    store.recordScan({ durationMs: 10, results: [] });

    const event = readEvents()[0] as ScanEvent;
    expect(event.fast).toBe(false);
    expect(event.filter).toEqual([]);
    expect(event.outdated).toBe(0);
  });
});

describe("opt-out and failure handling", () => {
  it.each(["0", "false", "off", "NO"])("writes nothing when GUP_HISTORY=%s", (value) => {
    process.env["GUP_HISTORY"] = value;
    store.recordUpdate({ providerId: "p", outcome: outcome() });
    expect(() => readEvents()).toThrow();
  });

  it("swallows an unwritable location and warns once on stderr", () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "not a directory");
    process.env["GUP_HISTORY_DIR"] = join(blocker, "history");

    expect(() => {
      store.recordUpdate({ providerId: "p", outcome: outcome({ id: "a" }) });
      store.recordUpdate({ providerId: "p", outcome: outcome({ id: "b" }) });
    }).not.toThrow();

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(String(stderrSpy.mock.calls[0]![0])).toContain("historique non écrit");
  });
});
