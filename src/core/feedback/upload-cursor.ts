import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../config/atomic-write.js";

/**
 * How far the shared journals went, per stream: the instant of the newest
 * record the service acknowledged (2xx), and how many records stamped with
 * that very instant were sent — the next upload takes records from that
 * instant on and skips those, so records sharing a millisecond across a
 * batch cut are neither lost nor sent twice. Plus when an upload was last
 * acknowledged, and when a sync last completed (`sync-cadence.ts`).
 * Machine-local, next to the install identity.
 *
 * An empty cursor means the next upload is a first one: everything the local
 * journals hold, oldest first. A record appended later with an older instant
 * (another gup process that ran meanwhile) is not sent: the cursor is a
 * high-water mark. A file written before `lastSyncAt` existed reads as no
 * sync completed yet.
 */

export interface StreamMark {
  /** ISO 8601 instant of the newest record sent. */
  readonly at: string;
  /** Records stamped `at` already sent. */
  readonly count: number;
}

export interface UploadCursor {
  readonly history: StreamMark | null;
  readonly logs: StreamMark | null;
  /** ISO 8601 instant of the last acknowledged upload, or null when none. */
  readonly lastUploadAt: string | null;
  /** ISO 8601 instant a run last ended with nothing left to send, or null when none did. */
  readonly lastSyncAt: string | null;
}

const EMPTY_CURSOR: UploadCursor = Object.freeze({
  history: null,
  logs: null,
  lastUploadAt: null,
  lastSyncAt: null,
});

const CURSOR_FILE = "upload-cursor.json";
const CURSOR_VERSION = 1;
const DIR_MODE = 0o700;

/** The cursor file of one state directory. */
export class UploadCursorFile {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  /** The stored cursor; an empty one when the file is missing or not valid. */
  read(): UploadCursor {
    try {
      const raw = JSON.parse(readFileSync(this.#file(), "utf8")) as Record<string, unknown>;
      return {
        history: markOrNull(raw["history"]),
        logs: markOrNull(raw["logs"]),
        lastUploadAt: instantOrNull(raw["lastUploadAt"]),
        lastSyncAt: instantOrNull(raw["lastSyncAt"]),
      };
    } catch {
      return EMPTY_CURSOR;
    }
  }

  /** Replace the cursor, atomically. Throws on an I/O failure. */
  save(cursor: UploadCursor): void {
    mkdirSync(this.#dir, { recursive: true, mode: DIR_MODE });
    writeFileAtomic(this.#file(), `${JSON.stringify({ v: CURSOR_VERSION, ...cursor })}\n`);
  }

  /** Nothing before `instant` is sent: what the journals held then stays out. Throws on I/O. */
  startAt(instant: string): void {
    const mark: StreamMark = { at: instant, count: 0 };
    this.save({ ...this.read(), history: mark, logs: mark });
  }

  /** Forget everything: the next upload is a first one. */
  clear(): void {
    rmSync(this.#file(), { force: true });
  }

  #file(): string {
    return join(this.#dir, CURSOR_FILE);
  }
}

function markOrNull(value: unknown): StreamMark | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, count } = value as Record<string, unknown>;
  const instant = instantOrNull(at);
  if (instant === null || !Number.isSafeInteger(count) || (count as number) < 0) return null;
  return { at: instant, count: count as number };
}

function instantOrNull(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
