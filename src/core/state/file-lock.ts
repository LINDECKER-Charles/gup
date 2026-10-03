import { closeSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";

/**
 * A short exclusive section on a file shared by several gup processes (two
 * terminals saving settings, a scheduled run updating its state): the work
 * runs while `<file>.lock` exists, created with `wx` so only one process can
 * hold it. Synchronous on purpose — the sections it guards are a re-read and
 * an atomic write, a few milliseconds.
 *
 * A holder that crashed leaves its lock file behind; one older than
 * {@link LOCK_STALE_MS} is removed and taken over. A live holder is waited
 * for with a bounded backoff, then the caller gets a {@link FileLockTimeoutError}.
 */

/** A lock this old belongs to a process that died inside its section. */
export const LOCK_STALE_MS = 10_000;

const LOCK_SUFFIX = ".lock";
const FIRST_BACKOFF_MS = 10;
const MAX_BACKOFF_MS = 160;
/** About 2.7 s of waiting in total with the backoff above. */
const MAX_ATTEMPTS = 20;
const LOCK_FILE_MODE = 0o600;

export class FileLockTimeoutError extends Error {
  constructor(lockFile: string) {
    super(`verrou occupé : ${lockFile}`);
    this.name = "FileLockTimeoutError";
  }
}

/** Run `work` while holding `<file>.lock`; the lock is released whatever happens. */
export function withFileLock<T>(file: string, work: () => T): T {
  const lockFile = `${file}${LOCK_SUFFIX}`;
  acquire(lockFile);
  try {
    return work();
  } finally {
    release(lockFile);
  }
}

function acquire(lockFile: string): void {
  let backoff = FIRST_BACKOFF_MS;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (tryCreate(lockFile)) return;
    if (removeIfStale(lockFile)) continue;
    pause(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
  throw new FileLockTimeoutError(lockFile);
}

/** True once the lock file is ours; false when another process holds it. */
function tryCreate(lockFile: string): boolean {
  let fd: number;
  try {
    fd = openSync(lockFile, "wx", LOCK_FILE_MODE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  try {
    writeSync(fd, String(process.pid));
  } finally {
    closeSync(fd);
  }
  return true;
}

/** Remove a lock left by a dead holder. True when the lock is gone (removed, or released meanwhile). */
function removeIfStale(lockFile: string): boolean {
  try {
    if (Date.now() - statSync(lockFile).mtimeMs < LOCK_STALE_MS) return false;
    unlinkSync(lockFile);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT";
  }
}

function release(lockFile: string): void {
  try {
    unlinkSync(lockFile);
  } catch {
    // Already gone: a peer judged it stale. Nothing left to release.
  }
}

/** Block this thread for `ms` — the guarded sections are synchronous. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}
