import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePty, type FakePty } from "../../support/pty/fake-pty.js";
import { recordingPane, type RecordingPane } from "../../support/pty/recording-pane.js";

/**
 * The embedded terminal's install sink, against an in-memory node-pty and
 * recording panes. The kill lever is replaced: a unit test kills nothing real.
 */
const { ptyKillMock } = vi.hoisted(() => ({
  ptyKillMock: { terminate: vi.fn(), force: vi.fn() },
}));
vi.mock("../../../src/core/pty/pty-kill.js", () => ({ ptyKill: ptyKillMock }));

import { routeInheritTo } from "../../../src/core/process/inherit-sink.js";
import { PTY_LABELS } from "../../../src/core/pty/pty-labels.js";
import { createPtySink } from "../../../src/core/pty/pty-sink.js";
import { decodePayload } from "../../../src/core/pty/trampoline-payload.js";
import { runInherit } from "../../../src/core/runner.js";

const TRAMPOLINE = { script: "/opt/gup/dist/pty-exec.js", execArgv: [] };
const REQUEST = { command: "winget", args: ["upgrade", "--id", "Git.Git"] };

let pty: FakePty;
let current: RecordingPane;

beforeEach(() => {
  pty = fakePty({ pid: 51 });
  current = recordingPane({ tail: "last visible line" });
});

const sink = () =>
  createPtySink({ pty: pty.module, trampoline: TRAMPOLINE }, { current: () => current });

describe("createPtySink", () => {
  it("runs the trampoline with the request, at the pane's size", () => {
    sink().start(REQUEST);
    const [call] = pty.spawned;
    expect(call).toMatchObject({ file: process.execPath, options: { cols: 100, rows: 20 } });
    expect(call!.args[0]).toBe(TRAMPOLINE.script);
    expect(decodePayload(call!.args[1]!)).toStrictEqual({ v: 1, ...REQUEST });
  });

  it("keeps writing a child's output into the pane it started in", () => {
    sink().start(REQUEST);
    const first = current;
    current = recordingPane();
    pty.last().emitData("trailing output");
    expect(first.output).toEqual(["trailing output"]);
    expect(current.output).toEqual([]);
  });

  it("routes the pane's keyboard to the child until it exits", async () => {
    const child = sink().start(REQUEST);
    current.inputs[0]!.write("y\r");
    current.inputs[0]!.resize(120, 30);
    expect(pty.last().written).toEqual(["y\r"]);
    expect(pty.last().resizes).toEqual([[120, 30]]);

    pty.last().emitExit({ exitCode: 0 });
    await child.exited;
    expect(current.detaches).toBe(1);
  });

  it("reports the exit with the pane's visible tail", async () => {
    const child = sink().start(REQUEST);
    pty.last().emitExit({ exitCode: 3010 });
    await expect(child.exited).resolves.toEqual({
      exitCode: 3010,
      failed: true,
      outputTail: "last visible line",
    });
  });

  it("kills through the session's tree kill", () => {
    const child = sink().start(REQUEST);
    child.kill();
    expect(ptyKillMock.terminate).toHaveBeenCalledWith(51);
  });

  it("fails an install whose terminal could not start, and says why in the pane", async () => {
    pty = fakePty({ spawnError: new Error("Cannot create process, error code: 2") });
    const child = sink().start(REQUEST);
    await expect(child.exited).resolves.toEqual({ exitCode: -1, failed: true });
    expect(current.notes).toEqual([PTY_LABELS.spawnFailed("Cannot create process, error code: 2")]);
    expect(() => child.kill()).not.toThrow();
  });

  it("writes gup's own lines into the current pane, as a pty sink", () => {
    const ptySink = sink();
    ptySink.note("Téléchargement de JetBrainsMono…");
    expect(ptySink.mode).toBe("pty");
    expect(current.notes).toEqual(["Téléchargement de JetBrainsMono…"]);
  });
});

describe("createPtySink routed by runInherit", () => {
  it("receives the sanitised request and reports the child's exit", async () => {
    const restore = routeInheritTo(sink());
    try {
      const result = runInherit("winget", ["upgrade", "--id", "7zip.7zip"]);
      await vi.waitFor(() => expect(pty.spawned).toHaveLength(1));
      expect(decodePayload(pty.spawned[0]!.args[1]!)).toMatchObject({
        command: "winget",
        args: ["upgrade", "--id", "7zip.7zip"],
      });
      pty.last().emitExit({ exitCode: 7 });
      await expect(result).resolves.toMatchObject({ exitCode: 7, failed: true });
    } finally {
      restore();
    }
  });
});
