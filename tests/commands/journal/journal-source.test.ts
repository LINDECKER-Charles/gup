import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJournalSource,
  MAX_DEBUG_RECORDS,
  MAX_JOURNAL_EVENTS,
} from "../../../src/commands/journal/journal-source.js";
import type { HistoryRead } from "../../../src/core/history/reader.js";
import { parsePeriod } from "../../../src/core/time/period.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";
import { logRecord } from "../../ui/panels/journal/journal-data.js";

const PERIOD = parsePeriod("30d", new Date("2026-10-03T12:00:00.000Z"))!;
const STATS = { files: 1, lines: 2, malformed: 0, unsupported: 0 };

function historyRead(events = [scanEvent(), updateEvent("pip", "rich")]): HistoryRead {
  return { dir: "history", events, stats: STATS };
}

const noLog = vi.fn(async () => ({ records: [], files: [], malformed: 0 }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("journal source", () => {
  it("loads the period's insights, its events newest first, and the newest log records", async () => {
    vi.stubEnv("GUP_HISTORY", "1");
    const readLog = vi.fn(async () => ({
      records: [logRecord({ event: "session.start" }), logRecord({ event: "session.end" })],
      files: [],
      malformed: 1,
    }));
    const source = createJournalSource({ readHistory: async () => historyRead(), readLog });

    const data = await source.load(PERIOD);

    expect(data.history).toMatchObject({ isRecordingOff: false, stats: STATS });
    expect(data.history.insights.totals).toMatchObject({ attempts: 1, scans: 1 });
    expect(data.history.events.map((event) => event.kind)).toEqual(["update", "scan"]);
    expect(data.log.records.map((record) => record.event)).toEqual(["session.end", "session.start"]);
    expect(data.log).toMatchObject({ malformed: 1, source: "default" });
    expect(readLog).toHaveBeenCalledWith({ limit: MAX_DEBUG_RECORDS, since: PERIOD.since }, expect.anything());
  });

  it("keeps the newest events only, past its bound", async () => {
    const many = Array.from({ length: MAX_JOURNAL_EVENTS + 5 }, (_unused, index) =>
      updateEvent("pip", `p${index}`, { ts: new Date(Date.UTC(2026, 8, 10) + index * 60_000).toISOString() }),
    );
    const source = createJournalSource({ readHistory: async () => historyRead(many), readLog: noLog });

    const { history } = await source.load(PERIOD);

    expect(history.events).toHaveLength(MAX_JOURNAL_EVENTS);
    expect(history.events[0]).toMatchObject({ packageId: `p${MAX_JOURNAL_EVENTS + 4}` });
    expect(history.insights.totals.attempts).toBe(MAX_JOURNAL_EVENTS + 5);
  });

  it("says when recording is off, and turns read failures into data", async () => {
    vi.stubEnv("GUP_HISTORY", "0");
    const source = createJournalSource({
      readHistory: async () => {
        throw new Error("EACCES: history");
      },
      readLog: async () => {
        throw new Error("EACCES: logs");
      },
    });

    const data = await source.load(PERIOD);

    expect(data.history).toMatchObject({ error: "EACCES: history", events: [], isRecordingOff: true });
    expect(data.history.insights.totals.attempts).toBe(0);
    expect(data.log).toMatchObject({ error: "EACCES: logs", records: [] });
  });

  it("writes JSON and CSV through the history export, the archive through the diagnostic", async () => {
    const exportHistory = vi.fn(async () => ({ path: "C:\\r\\h.csv", bytes: 1, records: 1, read: historyRead() }));
    const writeDiagnostic = vi.fn(async () => "C:\\r\\d.zip");
    const source = createJournalSource({ exportHistory, writeDiagnostic });

    await expect(source.export("csv", PERIOD)).resolves.toEqual({ ok: true, path: "C:\\r\\h.csv" });
    await expect(source.export("diagnostic", PERIOD)).resolves.toEqual({ ok: true, path: "C:\\r\\d.zip" });
    expect(exportHistory).toHaveBeenCalledWith({ format: "csv", period: PERIOD, target: { kind: "file" } });
    expect(writeDiagnostic).toHaveBeenCalledWith({ period: PERIOD, withHistory: true });
  });

  it("turns an export failure into an outcome, never a rejection", async () => {
    const source = createJournalSource({
      exportHistory: async () => {
        throw new Error("disk full");
      },
    });

    await expect(source.export("json", PERIOD)).resolves.toEqual({ ok: false, error: "disk full" });
  });
});
