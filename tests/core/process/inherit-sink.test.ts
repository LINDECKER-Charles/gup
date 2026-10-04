import { afterEach, describe, expect, it } from "vitest";
import {
  activeInheritSink,
  routeInheritTo,
  type InheritSink,
} from "../../../src/core/process/inherit-sink.js";

function fakeSink(): InheritSink {
  return {
    mode: "pipe",
    start: () => ({ exited: Promise.resolve({ exitCode: 0, failed: false }), kill: () => {} }),
    note: () => {},
  };
}

const restores: Array<() => void> = [];

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
});

function route(sink: InheritSink): () => void {
  const restore = routeInheritTo(sink);
  restores.push(restore);
  return restore;
}

describe("routeInheritTo", () => {
  it("installs the sink until the restore runs", () => {
    expect(activeInheritSink()).toBeNull();
    const sink = fakeSink();
    const restore = route(sink);
    expect(activeInheritSink()).toBe(sink);
    restore();
    expect(activeInheritSink()).toBeNull();
  });

  it("puts the previous sink back when a nested route is restored", () => {
    const outer = fakeSink();
    const inner = fakeSink();
    route(outer);
    const restoreInner = route(inner);
    restoreInner();
    expect(activeInheritSink()).toBe(outer);
  });

  it("is idempotent: a second restore does not undo a newer route", () => {
    const first = fakeSink();
    const second = fakeSink();
    const restoreFirst = route(first);
    restoreFirst();
    route(second);
    restoreFirst();
    expect(activeInheritSink()).toBe(second);
  });
});
