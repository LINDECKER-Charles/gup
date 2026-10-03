import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";

/**
 * Replace a file so that a crash leaves either the old content or the new
 * one, never half of each: write a private temp file next to it, flush it to
 * disk, then rename it over the target.
 */

/** The file operations used, injectable so tests can simulate a locked target. */
export interface FileOps {
  openSync: typeof openSync;
  writeSync: typeof writeSync;
  fsyncSync: typeof fsyncSync;
  closeSync: typeof closeSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
}

export const NODE_FILE_OPS: FileOps = {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
};

/**
 * Windows refuses a rename onto a file someone holds open (an antivirus scan,
 * the search indexer, an editor). Those holds are brief: retry a few times.
 */
const RENAME_RETRIES = 5;
const RENAME_BACKOFF_MS = 20;
const TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EBUSY", "EACCES"]);
const TEMP_FILE_MODE = 0o600;
const TEMP_SUFFIX_BYTES = 4;

export function writeFileAtomic(path: string, data: string, ops: FileOps = NODE_FILE_OPS): void {
  const temp = `${path}.${process.pid}.${randomBytes(TEMP_SUFFIX_BYTES).toString("hex")}.tmp`;
  try {
    writeTemp(temp, data, ops);
    renameWithRetry(temp, path, ops);
  } catch (err) {
    try {
      ops.unlinkSync(temp);
    } catch {
      // The temp file may not exist (open failed); nothing else to clean.
    }
    throw err;
  }
}

/** `wx`: a pre-staged file at the temp path is an error, never written through. */
function writeTemp(temp: string, data: string, ops: FileOps): void {
  const fd = ops.openSync(temp, "wx", TEMP_FILE_MODE);
  try {
    ops.writeSync(fd, data);
    ops.fsyncSync(fd);
  } finally {
    ops.closeSync(fd);
  }
}

function renameWithRetry(from: string, to: string, ops: FileOps): void {
  for (let attempt = 0; ; attempt++) {
    try {
      ops.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (attempt >= RENAME_RETRIES || !TRANSIENT_RENAME_ERRORS.has(code)) throw err;
      pause(RENAME_BACKOFF_MS);
    }
  }
}

/** The store's API is synchronous: block this thread for the backoff. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}
