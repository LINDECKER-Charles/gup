import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLogThreshold,
  effectiveLogThreshold,
  forwardLogRecord,
  installLogBackend,
  log,
  type LogBackend,
  type LogLevel,
} from "../../../src/core/log/log.js";
import type { LogRecord } from "../../../src/core/log/types.js";

afterEach(() => {
  installLogBackend(null);
});

function backendAt(enabled: readonly LogLevel[]) {
  const emit = vi.fn<LogBackend["emit"]>();
  const backend: LogBackend = { isEnabled: (level) => enabled.includes(level), emit };
  return { ...backend, emit };
}

describe("log facade", () => {
  it("is a silent no-op until a backend is installed", () => {
    expect(() => log.error("scan.failed", { reason: "x" })).not.toThrow();
    expect(log.isEnabled("error")).toBe(false);
  });

  it("forwards each level to the backend with its event and data", () => {
    const backend = backendAt(["error", "warn", "info", "debug", "trace"]);
    installLogBackend(backend);
    log.info("update.start", { from: "1.0" });
    log.trace("cmd.start");
    expect(backend.emit.mock.calls).toEqual([
      ["info", "update.start", { from: "1.0" }],
      ["trace", "cmd.start", undefined],
    ]);
  });

  it("skips the levels the backend does not record", () => {
    const backend = backendAt(["error", "warn", "info"]);
    installLogBackend(backend);
    log.debug("scan.provider");
    expect(backend.emit).not.toHaveBeenCalled();
    expect(log.isEnabled("debug")).toBe(false);
    expect(log.isEnabled("warn")).toBe(true);
  });

  it("never lets a failing backend reach the caller", () => {
    installLogBackend({
      isEnabled: () => {
        throw new Error("level lookup down");
      },
      emit: () => {},
    });
    expect(() => log.warn("x.y")).not.toThrow();
    expect(log.isEnabled("warn")).toBe(false);
    installLogBackend({
      isEnabled: () => true,
      emit: () => {
        throw new Error("disk full");
      },
    });
    expect(() => log.error("x.y")).not.toThrow();
  });

  it("reports the most verbose level the backend records as the threshold", () => {
    expect(effectiveLogThreshold()).toBe("off");
    installLogBackend(backendAt(["error", "warn", "info"]));
    expect(effectiveLogThreshold()).toBe("info");
    installLogBackend(backendAt([]));
    expect(effectiveLogThreshold()).toBe("off");
  });

  it("forwards a threshold change to a backend that supports it, and tolerates one that does not", () => {
    const setThreshold = vi.fn();
    installLogBackend({ ...backendAt([]), setThreshold });
    applyLogThreshold("trace");
    expect(setThreshold).toHaveBeenCalledWith("trace");
    installLogBackend(backendAt([]));
    expect(() => applyLogThreshold("debug")).not.toThrow();
    installLogBackend({
      ...backendAt([]),
      setThreshold: () => {
        throw new Error("sink closed");
      },
    });
    expect(() => applyLogThreshold("debug")).not.toThrow();
  });

  it("goes back to a no-op when the backend is removed", () => {
    const backend = backendAt(["info"]);
    installLogBackend(backend);
    installLogBackend(null);
    log.info("session.start");
    expect(backend.emit).not.toHaveBeenCalled();
  });

  it("hands an elevated child's record to a backend that takes them, and tolerates one that does not", () => {
    const child: LogRecord = {
      v: 1,
      ts: "2026-10-03T12:00:00.000Z",
      level: "info",
      event: "cmd.end",
      runId: "child",
      pid: 7,
    };
    const forward = vi.fn();
    installLogBackend({ ...backendAt(["info"]), forward });
    forwardLogRecord(child);
    expect(forward).toHaveBeenCalledWith(child);
    installLogBackend(backendAt(["info"]));
    expect(() => forwardLogRecord(child)).not.toThrow();
    installLogBackend({
      ...backendAt(["info"]),
      forward: () => {
        throw new Error("disk full");
      },
    });
    expect(() => forwardLogRecord(child)).not.toThrow();
  });
});

/**
 * Event names are an interface: the debug log, `gup log --grep` and the
 * diagnostics bundle key on them. Every literal name passed to the facade in
 * src/ must follow `<domain>.<action>`.
 */
const EVENT_NAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const MAX_EVENT_LENGTH = 48;
const LOG_CALL = /\blog\.(?:error|warn|info|debug|trace)\(\s*"([^"]*)"/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return Promise.resolve(entry.name.endsWith(".ts") ? [full] : []);
    }),
  );
  return nested.flat();
}

describe("log event names", () => {
  it("follow <domain>.<action>, lowercase, at most 48 characters", async () => {
    const bad: string[] = [];
    let seen = 0;
    for (const file of await sourceFiles(join(process.cwd(), "src"))) {
      for (const [, name] of (await readFile(file, "utf8")).matchAll(LOG_CALL)) {
        seen++;
        if (!EVENT_NAME.test(name!) || name!.length > MAX_EVENT_LENGTH) {
          bad.push(`${relative(process.cwd(), file).split(sep).join("/")}: ${name}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
