import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createConnection, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { writeFileAtomic } from "../config/atomic-write.js";
import { pathFlavour } from "../platform/path-flavour.js";
import { stateDir, type DirContext } from "../state/app-dirs.js";
import type { BatchGuard, BatchHolder, BatchWait } from "./update-extensions.js";

/**
 * One update batch at a time per user, across processes: a scheduled run and
 * an interactive one must never drive package managers at once (winget's
 * 1618 "another installation in progress", brew's lock).
 *
 * The lock is a listening endpoint the holder keeps open for the whole batch
 * — a named pipe on Windows, a unix socket in the lock's state dir on POSIX.
 * The operating system releases it when the holder exits, however it exits,
 * so a crash can never leave a lock behind and no lock is ever broken by age
 * while its holder lives. A JSON file in that dir only carries what a
 * waiting run shows (a scheduled run, started 4 min ago).
 */

export interface BatchLockLocation {
  /** `\\.\pipe\gup-update-<id>` on Windows, a socket path on POSIX. */
  readonly endpoint: string;
  /** Display information about the holder. */
  readonly infoFile: string;
}

/** Poll period of a run waiting for the batch. */
const BATCH_POLL_MS = 2000;

const INFO_FILE = "update-lock.json";
const SOCKET_FILE = "update.sock";
/** The lock's own state dir, beside the features' ones: `<state root>/gup/locks`. */
const LOCK_DIR = "locks";
const SCHEDULER_DIR_ENV = "GUP_SCHEDULER_DIR";
const PIPE_PREFIX = "\\\\.\\pipe\\gup-update-";
const ENDPOINT_ID_CHARS = 16;
/** sun_path is 104 bytes on macOS (108 on Linux), terminating NUL included. */
const MAX_SOCKET_PATH_BYTES = 103;
const PROBE_TIMEOUT_MS = 1000;
/** How quickly a Ctrl+C ends a wait. */
const ABORT_CHECK_MS = 100;
const STATE_DIR_MODE = 0o700;
const IN_USE_CODES = new Set(["EADDRINUSE", "EACCES"]);

/**
 * Where the lock lives for `context`, or null when the platform gives no
 * state dir. The endpoint is derived from the lock's dir, so a sandboxed
 * GUP_SCHEDULER_DIR (tests, a second install) never contends with the user's
 * real gup.
 */
export function batchLockLocation(context: Partial<DirContext> = {}): BatchLockLocation | null {
  const dir = lockDir(context);
  if (dir === null) return null;
  const platform = context.platform ?? process.platform;
  const path = pathFlavour(platform);
  const infoFile = path.join(dir, INFO_FILE);
  const id = endpointId(platform === "win32" ? dir.toLowerCase() : dir);
  if (platform === "win32") return { endpoint: `${PIPE_PREFIX}${id}`, infoFile };
  const socket = path.join(dir, SOCKET_FILE);
  if (Buffer.byteLength(socket) <= MAX_SOCKET_PATH_BYTES) return { endpoint: socket, infoFile };
  // A deep override: a short, per-user runtime location instead.
  const runtime = context.env?.["XDG_RUNTIME_DIR"] || tmpdir();
  return { endpoint: path.join(runtime, `gup-update-${id}.sock`), infoFile };
}

/**
 * `<state root>/gup/locks`: the batch belongs to no feature — interactive
 * runs take it as much as the scheduler — so an update never recreates the
 * scheduler's folder once `gup schedule uninstall --purge` removed it. With
 * GUP_SCHEDULER_DIR set, the lock stays in that directory: the scheduler it
 * sandboxes keeps a lock of its own.
 */
function lockDir(context: Partial<DirContext>): string | null {
  const schedulerDir = stateDir("scheduler", context);
  if (schedulerDir === null) return null;
  if ((context.env ?? process.env)[SCHEDULER_DIR_ENV]) return schedulerDir;
  const path = pathFlavour(context.platform ?? process.platform);
  return path.join(path.dirname(schedulerDir), LOCK_DIR);
}

function endpointId(dir: string): string {
  return createHash("sha256").update(dir).digest("hex").slice(0, ENDPOINT_ID_CHARS);
}

/** A held batch. Release it when the batch ends; exiting releases it too. */
export class BatchLock {
  readonly #server: Server;
  readonly #location: BatchLockLocation;

  private constructor(server: Server, location: BatchLockLocation) {
    this.#server = server;
    this.#location = location;
  }

  /** Take the batch if nobody holds it; otherwise say who does (null when unknown). */
  static async tryAcquire(
    location: BatchLockLocation,
    kind: BatchHolder["kind"],
  ): Promise<BatchLock | { readonly busy: BatchHolder | null }> {
    mkdirSync(dirname(location.infoFile), { recursive: true, mode: STATE_DIR_MODE });
    const server = await listenOn(location.endpoint);
    if (!server) return { busy: readHolder(location.infoFile) };
    const holder: BatchHolder = { kind, pid: process.pid, startedAt: new Date().toISOString() };
    try {
      writeFileAtomic(location.infoFile, `${JSON.stringify(holder)}\n`);
    } catch {
      // Display information only: a waiting run then shows a generic message.
    }
    return new BatchLock(server, location);
  }

  /** Close the endpoint and drop the display information. Idempotent. */
  async release(): Promise<void> {
    if (!this.#server.listening) return;
    rmSync(this.#location.infoFile, { force: true });
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
  }
}

/**
 * The guard interactive runs enter: take the batch, or report the holder once
 * and poll until it is free — or until the wait is aborted (Ctrl+C), which
 * resolves with a no-op release and lets the caller cancel its packages.
 */
export function createBatchGuard(
  location: BatchLockLocation,
  pollMs: number = BATCH_POLL_MS,
): BatchGuard {
  return {
    async enter(wait: BatchWait): Promise<() => void> {
      let hasReported = false;
      for (;;) {
        const attempt = await BatchLock.tryAcquire(location, "interactive");
        if (attempt instanceof BatchLock) return () => void attempt.release();
        if (!hasReported) wait.onWait(attempt.busy ?? unknownHolder());
        hasReported = true;
        if (await abortedWithin(wait, pollMs)) return () => {};
      }
    },
  };
}

/** Listen on the endpoint; null when another live process holds it. */
async function listenOn(endpoint: string): Promise<Server | null> {
  const first = await tryListen(endpoint);
  if (first !== "in-use") return first;
  // A unix socket file outlives a crashed holder: probe it before giving up.
  if (process.platform === "win32" || (await isAnswering(endpoint))) return null;
  rmSync(endpoint, { force: true });
  const second = await tryListen(endpoint);
  return second === "in-use" ? null : second;
}

function tryListen(endpoint: string): Promise<Server | "in-use"> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (IN_USE_CODES.has(err.code ?? "")) resolve("in-use");
      else reject(err);
    });
    server.listen(endpoint, () => {
      // Holding the lock must not keep the process alive on its own.
      server.unref();
      resolve(server);
    });
  });
}

/** True when a live process accepts connections on the endpoint. A silent one counts as alive. */
function isAnswering(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(endpoint);
    const settle = (isAlive: boolean): void => {
      socket.destroy();
      resolve(isAlive);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => settle(true));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

function readHolder(infoFile: string): BatchHolder | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(infoFile, "utf8"));
    return isHolder(raw) ? raw : null;
  } catch {
    return null;
  }
}

function isHolder(value: unknown): value is BatchHolder {
  const candidate = value as Partial<BatchHolder> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate.kind === "interactive" || candidate.kind === "scheduled") &&
    Number.isInteger(candidate.pid) &&
    typeof candidate.startedAt === "string"
  );
}

/** Holder whose display file could not be read: another gup run, started just now. */
function unknownHolder(): BatchHolder {
  return { kind: "interactive", pid: 0, startedAt: new Date().toISOString() };
}

/** Sleep `ms` in small steps, returning early (true) as soon as the wait is aborted. */
async function abortedWithin(wait: BatchWait, ms: number): Promise<boolean> {
  const step = Math.min(ms, ABORT_CHECK_MS);
  for (let waited = 0; waited < ms; waited += step) {
    if (wait.isAborted()) return true;
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  return wait.isAborted();
}
