import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { closeOnExitSignals, RunControl } from "../../../src/ui/run/run-control.js";
import { CTRL_C_DOUBLE_PRESS_MS } from "../../../src/ui/skip-controller.js";

function control(isInFlight = true) {
  let now = 0;
  const skip = vi.fn(() => isInFlight);
  const gate = new RunControl({ skip, clock: () => now });
  return { gate, skip, advance: (ms: number) => void (now += ms) };
}

describe("RunControl", () => {
  it("skips the install in flight without stopping the run", () => {
    const { gate, skip } = control();
    expect(gate.skip()).toBe(true);
    expect(skip).toHaveBeenCalledOnce();
    expect(gate.isAbortRequested()).toBe(false);
  });

  it("says when there was nothing to skip", () => {
    expect(control(false).gate.skip()).toBe(false);
  });

  it("stops: no new package, and the one in flight interrupted", () => {
    const { gate, skip } = control();
    gate.stop();
    expect(gate.isAbortRequested()).toBe(true);
    expect(skip).toHaveBeenCalledOnce();
  });

  it("stops after the elevated step without interrupting it", () => {
    const { gate, skip } = control();
    gate.stopAfterStep();
    expect(gate.isAbortRequested()).toBe(true);
    expect(skip).not.toHaveBeenCalled();
  });

  it("reads a second Ctrl+C within the double-press window as stop", () => {
    const { gate, advance } = control();
    expect(gate.pressCtrlC()).toBe("skip");
    advance(CTRL_C_DOUBLE_PRESS_MS - 1);
    expect(gate.pressCtrlC()).toBe("stop");
    advance(CTRL_C_DOUBLE_PRESS_MS);
    expect(gate.pressCtrlC()).toBe("skip");
  });
});

describe("closeOnExitSignals", () => {
  it.each([
    ["win32", ["SIGBREAK", "SIGTERM", "SIGHUP"]],
    ["darwin", ["SIGTERM", "SIGHUP", "SIGINT"]],
  ] as const)("closes the gate on the signals that end gup (%s)", (platform, signals) => {
    for (const signal of signals) {
      const source = new EventEmitter();
      const { gate, skip } = control();
      closeOnExitSignals(gate, source, platform);
      source.emit(signal);
      expect(gate.isAbortRequested()).toBe(true);
      // The screen host already skips the install in flight on its way out.
      expect(skip).not.toHaveBeenCalled();
    }
  });

  it("stops listening once released", () => {
    const source = new EventEmitter();
    const { gate } = control();
    const release = closeOnExitSignals(gate, source, "win32");
    expect(source.listenerCount("SIGBREAK")).toBe(1);
    release();
    release();
    expect(source.listenerCount("SIGBREAK")).toBe(0);
    source.emit("SIGBREAK");
    expect(gate.isAbortRequested()).toBe(false);
  });
});
