import type {
  PtyDisposable,
  PtyExitEvent,
  PtyHandle,
  PtyModule,
  PtySpawnOptions,
} from "../../../src/core/pty/pty-loader.js";

/**
 * An in-memory node-pty for the PTY layer's unit suites: records what was
 * spawned, written and resized, and lets the test emit output and the exit.
 */

export interface FakeHandle extends PtyHandle {
  readonly written: Array<string | Buffer>;
  readonly resizes: Array<readonly [number, number]>;
  emitData(data: string): void;
  emitExit(event: PtyExitEvent): void;
  /** Make the next calls of `resize` throw, as ConPTY does after an exit. */
  failResize(): void;
}

export interface SpawnCall {
  readonly file: string;
  readonly args: readonly string[];
  readonly options: PtySpawnOptions;
  readonly handle: FakeHandle;
}

export interface FakePty {
  readonly module: PtyModule;
  readonly spawned: SpawnCall[];
  /** The handle of the last spawn. */
  last(): FakeHandle;
}

export interface FakePtyOptions {
  readonly pid?: number;
  /** Extra own properties of every handle (the ConPTY `_agent` shape). */
  readonly internals?: () => Record<string, unknown>;
  /** Make `spawn` throw this instead of returning a handle. */
  readonly spawnError?: Error;
  /** Called with every new handle, e.g. to schedule its exit. */
  readonly onSpawn?: (handle: FakeHandle) => void;
}

const DEFAULT_PID = 4242;

export function fakePty(options: FakePtyOptions = {}): FakePty {
  const spawned: SpawnCall[] = [];
  const module: PtyModule = {
    spawn(file, args, spawnOptions) {
      if (options.spawnError) throw options.spawnError;
      const handle = fakeHandle(options.pid ?? DEFAULT_PID);
      Object.assign(handle, options.internals?.() ?? {});
      spawned.push({ file, args: [...args], options: spawnOptions, handle });
      options.onSpawn?.(handle);
      return handle;
    },
  };
  return {
    module,
    spawned,
    last: () => {
      const call = spawned.at(-1);
      if (!call) throw new Error("fake pty: nothing was spawned");
      return call.handle;
    },
  };
}

function fakeHandle(pid: number): FakeHandle {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(event: PtyExitEvent) => void>();
  let isResizeBroken = false;
  const handle: FakeHandle = {
    pid,
    written: [],
    resizes: [],
    onData: (listener) => subscribe(dataListeners, listener),
    onExit: (listener) => subscribe(exitListeners, listener),
    write: (data) => void handle.written.push(data),
    resize: (cols, rows) => {
      if (isResizeBroken) throw new Error("Cannot resize a pty that has already exited");
      handle.resizes.push([cols, rows]);
    },
    emitData: (data) => dataListeners.forEach((listener) => listener(data)),
    emitExit: (event) => [...exitListeners].forEach((listener) => listener(event)),
    failResize: () => void (isResizeBroken = true),
  };
  return handle;
}

function subscribe<T>(listeners: Set<T>, listener: T): PtyDisposable {
  listeners.add(listener);
  return { dispose: () => void listeners.delete(listener) };
}
