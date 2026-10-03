import { afterEach, describe, expect, it, vi } from "vitest";
import {
  elevatedLogBuffer,
  ingestElevatedLines,
  MAX_FORWARDED_BYTES,
  MAX_FORWARDED_LINES,
  MemorySink,
} from "../../../src/core/log/elevated-bridge.js";
import { installLogBackend, type LogBackend } from "../../../src/core/log/log.js";
import type { LogRecord } from "../../../src/core/log/types.js";

afterEach(() => {
  installLogBackend(null);
  elevatedLogBuffer.drain();
});

function record(over: Partial<LogRecord> = {}): LogRecord {
  return {
    v: 1,
    ts: "2026-10-03T12:00:00.000Z",
    level: "info",
    event: "cmd.end",
    runId: "child",
    pid: 7,
    ...over,
  };
}

/** A backend that only hears forwarded records. */
function forwardingBackend() {
  const forward = vi.fn<NonNullable<LogBackend["forward"]>>();
  installLogBackend({ isEnabled: () => true, emit: () => {}, forward });
  return forward;
}

describe("MemorySink", () => {
  it("keeps records in order until drained, then starts empty", () => {
    const sink = new MemorySink();
    sink.write("a", "info");
    sink.write("b", "error");
    expect(sink.drain()).toEqual(["a", "b"]);
    expect(sink.drain()).toEqual([]);
  });

  it("stops at the line cap, keeping one notice saying so", () => {
    const sink = new MemorySink({ cappedLine: () => "capped" });
    for (let i = 0; i < MAX_FORWARDED_LINES + 10; i++) sink.write(`line ${i}`, "info");
    const kept = sink.drain();
    expect(kept).toHaveLength(MAX_FORWARDED_LINES);
    expect(kept.at(-1)).toBe("capped");
    expect(kept.filter((line) => line === "capped")).toHaveLength(1);
  });

  it("stops at the byte cap", () => {
    const sink = new MemorySink();
    const big = "x".repeat(100 * 1024);
    for (let i = 0; i < 10; i++) sink.write(big, "info");
    const bytes = sink.drain().reduce((total, line) => total + line.length, 0);
    expect(bytes).toBeLessThanOrEqual(MAX_FORWARDED_BYTES);
    expect(bytes).toBeGreaterThan(MAX_FORWARDED_BYTES - big.length * 2);
  });

  it("is the buffer the elevated child drains into its batch output", () => {
    elevatedLogBuffer.write("from the child", "info");
    expect(elevatedLogBuffer.drain()).toEqual(["from the child"]);
  });
});

describe("ingestElevatedLines", () => {
  it("forwards each well-formed record and drops the rest", () => {
    const forward = forwardingBackend();
    ingestElevatedLines([
      JSON.stringify(record({ event: "update.start" })),
      "not json",
      42,
      JSON.stringify({ ...record(), v: 2 }),
      JSON.stringify(record({ event: "update.end", level: "warn" })),
    ]);
    expect(forward.mock.calls.map(([forwarded]) => forwarded.event)).toEqual(["update.start", "update.end"]);
  });

  it("ignores anything that is not a list, and applies the caps again", () => {
    const forward = forwardingBackend();
    ingestElevatedLines({ log: "x" });
    ingestElevatedLines(undefined);
    expect(forward).not.toHaveBeenCalled();
    const line = JSON.stringify(record());
    ingestElevatedLines(Array.from({ length: MAX_FORWARDED_LINES + 50 }, () => line));
    expect(forward).toHaveBeenCalledTimes(MAX_FORWARDED_LINES);
    forward.mockClear();
    const padded = JSON.stringify(record({ data: { pad: "y".repeat(60 * 1024) } }));
    ingestElevatedLines(Array.from({ length: 20 }, () => padded));
    expect(forward.mock.calls.length).toBeLessThan(10);
  });

  it("does nothing without a backend that takes forwarded records", () => {
    installLogBackend({ isEnabled: () => true, emit: () => {} });
    expect(() => ingestElevatedLines([JSON.stringify(record())])).not.toThrow();
  });
});
