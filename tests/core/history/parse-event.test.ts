import { describe, expect, it } from "vitest";
import {
  MAX_FIELD_LENGTH,
  MAX_HISTORY_LINE_LENGTH,
  parseHistoryLine,
} from "../../../src/core/history/parse-event.js";
import { scanEvent, updateEvent } from "../../support/history-fixtures.js";

const line = (record: object): string => JSON.stringify(record);

describe("parseHistoryLine", () => {
  it("reads back a v1 update and a v1 scan exactly as the store wrote them", () => {
    const update = updateEvent("winget", "Git.Git", {
      trigger: "menu",
      message: "ok",
      retry: "--force",
      elevated: true,
      scheduleId: "s1",
    });
    const scan = scanEvent({
      fast: true,
      filter: ["winget"],
      providers: [{ providerId: "winget", outdated: 2, durationMs: 1200, error: "boom" }],
    });

    expect(parseHistoryLine(line(update))).toEqual({ kind: "event", event: update });
    expect(parseHistoryLine(line(scan))).toEqual({ kind: "event", event: scan });
  });

  it("drops the fields it does not know, and an unknown trigger, but keeps the record", () => {
    const update = updateEvent("npm-g", "typescript");
    const parsed = parseHistoryLine(
      line({ ...update, trigger: "webhook", addedLater: { nested: true } }),
    );

    expect(parsed).toEqual({ kind: "event", event: update });
  });

  it("never reads through a prototype key", () => {
    const parsed = parseHistoryLine(
      `{"__proto__":{"polluted":true},${line(updateEvent("pip", "rich")).slice(1)}`,
    );

    expect(parsed.kind).toBe("event");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("normalises the instant to ISO 8601 UTC", () => {
    const parsed = parseHistoryLine(line(updateEvent("pip", "rich", { ts: "2026-10-01T11:00:00+02:00" })));

    expect(parsed.kind === "event" && parsed.event.ts).toBe("2026-10-01T09:00:00.000Z");
  });

  it("cuts every string to the field bound", () => {
    const parsed = parseHistoryLine(line(updateEvent("pip", "rich", { message: "x".repeat(10_000) })));

    expect(parsed.kind === "event" && parsed.event.kind === "update" && parsed.event.message?.length).toBe(
      MAX_FIELD_LENGTH,
    );
  });

  it("drops the terminal escapes a tool printed, keeping a message's line breaks", () => {
    const parsed = parseHistoryLine(
      line(
        updateEvent("winget", "Pkg\tId\u0007", {
          message: "\u001b[31mError\u001b[0m: failed\r\n\u001b]52;c;aGk=\u0007next\tline\u0000",
          to: "2.0\u001b[2J",
        }),
      ),
    );

    expect(parsed.kind === "event" && parsed.event).toMatchObject({
      packageId: "Pkg Id ",
      message: "Error: failed\r\nnext\tline",
      to: "2.0",
    });
  });

  it.each([
    ["a torn line", line(updateEvent("pip", "rich")).slice(0, 40)],
    ["not an object", "[1,2,3]"],
    ["no version", line({ ...updateEvent("pip", "rich"), v: undefined })],
    ["a version that is not a number", line({ ...updateEvent("pip", "rich"), v: "1" })],
    ["an unreadable instant", line(updateEvent("pip", "rich", { ts: "yesterday" }))],
    ["an instant before 1970", line(updateEvent("pip", "rich", { ts: "1969-12-31T23:59:59.000Z" }))],
    ["an instant in a three-digit year", line(updateEvent("pip", "rich", { ts: "0999-06-01T00:00:00.000Z" }))],
    ["an instant in year 9999", line(updateEvent("pip", "rich", { ts: "9999-01-01T00:00:00.000Z" }))],
    ["an empty package id", line(updateEvent("pip", ""))],
    ["a negative duration", line(updateEvent("pip", "rich", { durationMs: -1 }))],
    ["a message that is not text", line({ ...updateEvent("pip", "rich"), message: 42 })],
    ["elevated that is not a boolean", line({ ...updateEvent("pip", "rich"), elevated: "yes" })],
    ["a scan without providers", line({ ...scanEvent(), providers: null })],
    ["a scan provider without an id", line(scanEvent({ providers: [{ providerId: "", outdated: 1 }] }))],
    ["an oversized line", line(updateEvent("pip", "rich", { message: "x".repeat(MAX_HISTORY_LINE_LENGTH) }))],
  ])("calls %s malformed", (_case, text) => {
    expect(parseHistoryLine(text)).toEqual({ kind: "malformed" });
  });

  it.each([
    ["a newer schema version", line({ ...updateEvent("pip", "rich"), v: 2 })],
    ["a record kind it does not know", line({ ...updateEvent("pip", "rich"), kind: "schedule" })],
    ["an outcome it does not know", line({ ...updateEvent("pip", "rich"), status: "cancelled" })],
  ])("calls %s unsupported", (_case, text) => {
    expect(parseHistoryLine(text)).toEqual({ kind: "unsupported" });
  });
});
