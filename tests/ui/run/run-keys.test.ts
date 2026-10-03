import { describe, expect, it } from "vitest";
import { runCommandFor, type RunKeyMode } from "../../../src/ui/run/run-keys.js";

const key = (name: string, ctrl = false) => ({ name, ctrl, sequence: name });

describe("runCommandFor", () => {
  it.each<RunKeyMode>(["running", "elevating", "waiting"])(
    "gives gup's levers while %s, and refuses q",
    (mode) => {
      expect(runCommandFor(key("s"), mode)).toBe("skip");
      expect(runCommandFor(key("x"), mode)).toBe("stop");
      expect(runCommandFor(key("t"), mode)).toBe("focus");
      expect(runCommandFor(key("v"), mode)).toBe("toggle-size");
      expect(runCommandFor(key("down"), mode)).toBe("down");
      expect(runCommandFor(key("pageup"), mode)).toBe("page-up");
      expect(runCommandFor(key("q"), mode)).toBe("refuse-quit");
      expect(runCommandFor(key("return"), mode)).toBe("none");
    },
  );

  it("hands every key to the installer while typing, except Ctrl+G", () => {
    expect(runCommandFor(key("g", true), "typing")).toBe("release");
    for (const name of ["q", "x", "s", "escape", "return", "g"]) {
      expect(runCommandFor(key(name), "typing")).toBe("pass");
    }
    expect(runCommandFor(key("c", true), "typing")).toBe("pass");
  });

  it("leaves the results on Entrée, Échap or q and moves between packages", () => {
    for (const name of ["return", "enter", "escape", "q"]) {
      expect(runCommandFor(key(name), "done")).toBe("leave");
    }
    expect(runCommandFor(key("up"), "done")).toBe("up");
    expect(runCommandFor(key("k"), "done")).toBe("up");
    expect(runCommandFor(key("s"), "done")).toBe("none");
  });

  it("never acts on Ctrl+C: the screen's interception owns it", () => {
    for (const mode of ["running", "elevating", "waiting", "done"] as const) {
      expect(runCommandFor(key("c", true), mode)).toBe("none");
    }
  });
});
