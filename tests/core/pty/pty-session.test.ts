import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakePty, type FakePtyOptions } from "../../support/pty/fake-pty.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * One child in a pseudo-terminal, against an in-memory node-pty. The kill
 * levers and the exit-file watch are replaced, so the tests drive both.
 */
const { ptyKillMock, watchMock } = vi.hoisted(() => ({
  ptyKillMock: { terminate: vi.fn(async () => {}) },
  watchMock: vi.fn(),
}));
vi.mock("../../../src/core/pty/pty-kill.js", () => ({ ptyKill: ptyKillMock }));
vi.mock("../../../src/core/pty/exit-file.js", () => ({ watchExitFile: watchMock }));

import {
  isReleasableConpty,
  PtySession,
  releaseConpty,
  TERM_NAME,
  type PtyLaunch,
} from "../../../src/core/pty/pty-session.js";

const LAUNCH: PtyLaunch = {
  file: "/usr/bin/node",
  args: ["pty-exec.js", "e30"],
  cols: 100,
  rows: 30,
};
const PENDING = Symbol("pending");

afterEach(() => {
  vi.useRealTimers();
  restorePlatform();
});

function start(launch: PtyLaunch = LAUNCH, options: FakePtyOptions = {}) {
  const pty = fakePty(options);
  const onData = vi.fn();
  const session = PtySession.start(pty.module, launch, onData);
  return { session, handle: pty.last(), onData, spawned: pty.spawned };
}

/** The value of a promise if it already settled, else PENDING. */
async function peek<T>(promise: Promise<T>): Promise<T | typeof PENDING> {
  const later = new Promise<typeof PENDING>((resolve) => setImmediate(() => resolve(PENDING)));
  return Promise.race([promise, later]);
}

/** A ConPTY agent shaped like node-pty 1.1.0's, recording its release. */
function conptyInternals(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const worker = new EventEmitter();
  const agent = {
    _useConpty: true,
    _useConptyDll: false,
    _pty: 7,
    _ptyNative: { kill: (pty: number, dll: boolean) => calls.push(`close ${pty} ${dll}`) },
    _conoutSocketWorker: { dispose: () => calls.push("worker"), _worker: worker },
    _inSocket: { destroy: () => calls.push("in") },
    _outSocket: { destroy: () => calls.push("out") },
    ...overrides,
  };
  return { calls, worker, internals: () => ({ _agent: agent }) };
}

describe("PtySession: start and I/O", () => {
  it("starts the child as xterm at the pane's size, never below a usable minimum", () => {
    expect(start().spawned[0]).toMatchObject({
      file: "/usr/bin/node",
      args: ["pty-exec.js", "e30"],
      options: { name: TERM_NAME, cols: 100, rows: 30 },
    });
    const tiny = start({ ...LAUNCH, cols: 4, rows: 1 });
    expect(tiny.spawned[0]!.options).toMatchObject({ cols: 20, rows: 3 });
  });

  it("forwards the output and tells when it last came", () => {
    const { session, handle, onData } = start();
    const before = session.lastOutputAt;
    handle.emitData("Password: ");
    expect(onData).toHaveBeenCalledWith("Password: ");
    expect(session.lastOutputAt).toBeGreaterThanOrEqual(before);
  });

  it("keeps the install going when the pane throws on output", () => {
    const { handle, onData } = start();
    onData.mockImplementation(() => {
      throw new Error("pane gone");
    });
    expect(() => handle.emitData("x")).not.toThrow();
  });

  it("writes keys as text and bytes as a Buffer, and nothing once the child exited", () => {
    const { session, handle } = start();
    session.write("y\r");
    session.write(new Uint8Array([0x1b, 0x5b, 0x41]));
    handle.emitExit({ exitCode: 0 });
    session.write("late");
    expect(handle.written).toEqual(["y\r", Buffer.from([0x1b, 0x5b, 0x41])]);
  });

  it("resizes within the minimum, never after the exit, and survives a refusal", () => {
    const { session, handle } = start();
    session.resize(120, 40);
    session.resize(3, 1);
    handle.failResize();
    expect(() => session.resize(90, 20)).not.toThrow();
    handle.emitExit({ exitCode: 0 });
    session.resize(80, 24);
    expect(handle.resizes).toEqual([
      [120, 40],
      [20, 3],
    ]);
  });
});

describe("PtySession: exit", () => {
  it.each([
    [{ exitCode: 0 }, { exitCode: 0, failed: false }],
    [{ exitCode: 3010 }, { exitCode: 3010, failed: true }],
    [{ exitCode: 0, signal: 0 }, { exitCode: 0, failed: false }],
    [{ exitCode: 0, signal: 15 }, { exitCode: -1, failed: true }],
  ])("reads node-pty's exit %o as %o", async (event, exit) => {
    const { session, handle } = start();
    handle.emitExit(event);
    await expect(session.exited).resolves.toEqual(exit);
  });

  it("forwards nothing once node-pty reported the exit", () => {
    const { handle, onData } = start();
    handle.emitExit({ exitCode: 0 });
    handle.emitData("late");
    expect(onData).not.toHaveBeenCalled();
  });
});

describe("PtySession: exit file (Windows fast path)", () => {
  function startWatched(options: FakePtyOptions = {}) {
    const stop = vi.fn();
    watchMock.mockReturnValueOnce(stop);
    const started = start({ ...LAUNCH, exitFile: "C:\\t\\a.exit" }, options);
    const onCode = watchMock.mock.lastCall![1] as (code: number) => void;
    return { ...started, onCode, stop };
  }

  it("resolves on a 0 before node-pty's exit, and still forwards the late output", async () => {
    const { session, handle, onData, onCode, stop } = startWatched();
    expect(watchMock).toHaveBeenCalledWith("C:\\t\\a.exit", expect.any(Function));

    onCode(0);
    await expect(session.exited).resolves.toEqual({ exitCode: 0, failed: false });
    handle.emitData("last line");
    expect(onData).toHaveBeenCalledWith("last line");

    handle.emitExit({ exitCode: 1 });
    await expect(session.exited).resolves.toEqual({ exitCode: 0, failed: false });
    expect(stop).toHaveBeenCalled();
  });

  it("releases the pseudo-console at node-pty's exit, not at the fast exit", async () => {
    setPlatform("win32");
    const conpty = conptyInternals();
    const { session, handle, onCode } = startWatched({ internals: conpty.internals });
    onCode(0);
    await session.exited;
    expect(conpty.calls).toEqual([]);
    handle.emitExit({ exitCode: 0 });
    expect(conpty.calls).toHaveLength(4);
  });

  it("waits for node-pty's exit on a failure, so the output is complete", async () => {
    const { session, handle, onCode } = startWatched();
    onCode(7);
    expect(await peek(session.exited)).toBe(PENDING);
    handle.emitExit({ exitCode: 7 });
    await expect(session.exited).resolves.toEqual({ exitCode: 7, failed: true });
  });

  it("does not watch anything without an exit file", () => {
    start();
    expect(watchMock).not.toHaveBeenCalled();
  });
});

describe("PtySession: kill", () => {
  it("kills the tree once, however many times it is asked", () => {
    const { session } = start(LAUNCH, { pid: 31 });
    session.kill();
    session.kill();
    expect(ptyKillMock.terminate).toHaveBeenCalledExactlyOnceWith(31);
  });

  // The trampoline dies at once; the installer it started may still be
  // running (npm finishing its rollback, a download that never ends). A
  // provider repairs what an interrupted installer left, so the outcome waits
  // for the whole tree, not for the trampoline.
  it("reports a killed child once its whole tree is gone, not when the trampoline died", async () => {
    let treeGone!: () => void;
    ptyKillMock.terminate.mockReturnValueOnce(new Promise<void>((done) => (treeGone = done)));
    const { session, handle } = start();
    session.kill();
    handle.emitExit({ exitCode: 0, signal: 15 });
    expect(await peek(session.exited)).toBe(PENDING);

    treeGone();
    await expect(session.exited).resolves.toEqual({ exitCode: -1, failed: true });
  });

  it("does nothing once the child exited", () => {
    const { session, handle } = start();
    handle.emitExit({ exitCode: 0 });
    session.kill();
    expect(ptyKillMock.terminate).not.toHaveBeenCalled();
  });
});

describe("releaseConpty", () => {
  it("closes the pseudo-console and its pipes once node-pty reported the exit", () => {
    setPlatform("win32");
    const conpty = conptyInternals();
    const { handle } = start(LAUNCH, { internals: conpty.internals });
    expect(conpty.calls).toEqual([]);

    handle.emitExit({ exitCode: 0 });
    expect(conpty.calls).toEqual(["close 7 false", "worker", "in", "out"]);

    releaseConpty(handle);
    expect(conpty.calls).toHaveLength(4);
  });

  it("keeps a conout worker failing on its closed pipe from taking gup down", () => {
    setPlatform("win32");
    const conpty = conptyInternals();
    const { handle } = start(LAUNCH, { internals: conpty.internals });
    handle.emitExit({ exitCode: 0 });

    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    expect(() => conpty.worker.emit("error", epipe)).not.toThrow();
  });

  it("recognises only a system-ConPTY handle of the pinned shape", () => {
    const pty = (overrides: Record<string, unknown>) =>
      fakePty({ internals: conptyInternals(overrides).internals }).module.spawn("x", [], {
        name: TERM_NAME,
        cols: 80,
        rows: 24,
      });
    expect(isReleasableConpty(pty({}))).toBe(true);
    expect(isReleasableConpty(pty({ _useConptyDll: true }))).toBe(false);
    expect(isReleasableConpty(pty({ _useConpty: false }))).toBe(false);
    expect(isReleasableConpty(pty({ _conoutSocketWorker: {} }))).toBe(false);
    expect(isReleasableConpty(pty({ _conoutSocketWorker: { dispose: () => {} } }))).toBe(false);
    const plain = fakePty().module.spawn("x", [], { name: TERM_NAME, cols: 80, rows: 24 });
    expect(isReleasableConpty(plain)).toBe(false);
  });

  it("leaves handles alone off Windows", () => {
    setPlatform("darwin");
    const conpty = conptyInternals();
    const { handle } = start(LAUNCH, { internals: conpty.internals });
    handle.emitExit({ exitCode: 0 });
    expect(conpty.calls).toEqual([]);
  });
});
