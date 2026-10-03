import { afterEach, describe, expect, it, vi } from "vitest";
import { setCommandTracer, traceCommand } from "../../../src/core/process/command-tracer.js";

afterEach(() => {
  setCommandTracer(null);
});

describe("traceCommand", () => {
  it("is a no-op without a tracer", () => {
    expect(() => traceCommand("probe", "winget", ["list"]).end({ exitCode: 0, failed: false })).not.toThrow();
  });

  it("forwards the start and the result to the installed tracer", () => {
    const end = vi.fn();
    const tracer = vi.fn(() => ({ end }));
    setCommandTracer(tracer);
    traceCommand("inherit", "npm", ["install", "-g", "x"]).end({ exitCode: 1, failed: true });
    expect(tracer).toHaveBeenCalledWith("inherit", "npm", ["install", "-g", "x"]);
    expect(end).toHaveBeenCalledWith({ exitCode: 1, failed: true });
  });

  it("never lets a broken tracer reach the caller", () => {
    setCommandTracer(() => {
      throw new Error("tracer down");
    });
    expect(() => traceCommand("probe", "x", []).end({ exitCode: 0, failed: false })).not.toThrow();
    setCommandTracer(() => ({
      end: () => {
        throw new Error("end down");
      },
    }));
    expect(() => traceCommand("probe", "x", []).end({ exitCode: 0, failed: false })).not.toThrow();
  });

  it("stops tracing once the tracer is removed", () => {
    const tracer = vi.fn(() => ({ end: vi.fn() }));
    setCommandTracer(tracer);
    setCommandTracer(null);
    traceCommand("probe", "x", []);
    expect(tracer).not.toHaveBeenCalled();
  });
});
