import { afterEach, describe, expect, it, vi } from "vitest";

const { deferUntilExitMock } = vi.hoisted(() => ({ deferUntilExitMock: vi.fn() }));
vi.mock("../../../src/core/process/output-router.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/core/process/output-router.js")>()),
  deferUntilExit: deferUntilExitMock,
}));

import { installLogBackend, log, type LogLevel } from "../../../src/core/log/log.js";
import { formatLogLine, SinkLogBackend } from "../../../src/core/log/log-backend.js";
import type { LogRecord, LogSink } from "../../../src/core/log/types.js";
import { RUN_ID, withOperation } from "../../../src/core/state/run-context.js";

afterEach(() => {
  installLogBackend(null);
});

/** A sink that keeps what it receives, as parsed records. */
function memorySink() {
  const written: { record: LogRecord; level: LogLevel }[] = [];
  const sink: LogSink = {
    write: (line, level) => void written.push({ record: JSON.parse(line) as LogRecord, level }),
    close: vi.fn(),
  };
  return { sink, written, records: () => written.map((entry) => entry.record) };
}

function installed(threshold: Parameters<SinkLogBackend["setThreshold"]>[0]) {
  const memory = memorySink();
  const backend = new SinkLogBackend({
    threshold,
    sink: memory.sink,
    now: () => new Date("2026-10-03T12:00:00.000Z"),
  });
  installLogBackend(backend);
  return { ...memory, backend };
}

describe("SinkLogBackend", () => {
  it("records from its threshold on, stamped with time, run id and pid", () => {
    const { records } = installed("info");
    log.debug("scan.provider");
    log.info("scan.start", { planned: 3 });
    log.error("session.crash");
    expect(records()).toEqual([
      { v: 1, ts: "2026-10-03T12:00:00.000Z", level: "info", event: "scan.start", runId: RUN_ID, pid: process.pid, data: { planned: 3 } },
      { v: 1, ts: "2026-10-03T12:00:00.000Z", level: "error", event: "session.crash", runId: RUN_ID, pid: process.pid },
    ]);
  });

  it("records nothing at all when off, and follows a threshold change", () => {
    const { records, backend } = installed("off");
    log.error("session.crash");
    expect(records()).toEqual([]);
    backend.setThreshold("trace");
    log.trace("cmd.start");
    expect(records().map((r) => r.event)).toEqual(["cmd.start"]);
    expect(backend.threshold()).toBe("trace");
  });

  it("attributes each line to the operation in flight, across awaits and concurrent tasks", async () => {
    const { records } = installed("info");
    const task = (providerId: string, delay: number) =>
      withOperation({ op: "scan", providerId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        log.info("scan.provider");
      });
    await Promise.all([task("npm-g", 20), task("pip", 5)]);
    expect(records().map((r) => r.ctx)).toEqual([
      { op: "scan", providerId: "pip" },
      { op: "scan", providerId: "npm-g" },
    ]);
  });

  it("sanitises the data and keeps a bad event name as data", () => {
    const { records } = installed("info");
    log.info("update.end", { message: "auth failed for https://bob:pw@host" });
    log.info("Not An Event", { x: 1 });
    expect(records()[0]?.data).toEqual({ message: "auth failed for https://***@host" });
    expect(records()[1]).toMatchObject({ event: "log.bad-event", data: { x: 1, event: "Not An Event" } });
  });

  it("stops at the first sink failure without throwing, and says so once at exit", () => {
    const sink: LogSink = {
      write: () => {
        throw new Error("EACCES: permission denied");
      },
      close: vi.fn(),
    };
    const backend = new SinkLogBackend({ threshold: "info", sink });
    installLogBackend(backend);
    expect(() => log.info("session.start")).not.toThrow();
    log.error("session.crash");
    expect(backend.failure()).toBe("EACCES: permission denied");
    expect(log.isEnabled("error")).toBe(false);
    expect(sink.close).toHaveBeenCalledOnce();
    expect(deferUntilExitMock).toHaveBeenCalledOnce();
    expect(deferUntilExitMock).toHaveBeenCalledWith("journal de debug non écrit — EACCES: permission denied");
  });

  it("writes an elevated child's record under this run, marked, redacted again, filtered", () => {
    const { records, backend } = installed("info");
    const child: LogRecord = {
      v: 1,
      ts: "2026-10-03T11:59:00.000Z",
      level: "warn",
      event: "cmd.end",
      runId: "child-run",
      pid: 4242,
      ctx: { op: "update", providerId: "choco", packageId: "git" },
      data: { stderrTail: "password=hunter2" },
    };
    backend.forward(child);
    backend.forward({ ...child, level: "debug" });
    expect(records()).toEqual([
      { ...child, runId: RUN_ID, data: { stderrTail: "password=***" }, elevated: true },
    ]);
  });
});

describe("formatLogLine", () => {
  it("serialises a record the reader understands, for the sinks' own notices", () => {
    const record = JSON.parse(formatLogLine("warn", "log.capped", { day: "2026-10-03" })) as LogRecord;
    expect(record).toMatchObject({ v: 1, level: "warn", event: "log.capped", runId: RUN_ID, data: { day: "2026-10-03" } });
  });
});
