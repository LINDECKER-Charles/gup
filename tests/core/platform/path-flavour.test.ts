import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pathFlavour } from "../../../src/core/platform/path-flavour.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

afterEach(() => restorePlatform());

describe("pathFlavour", () => {
  it("builds Windows paths for win32 and POSIX paths elsewhere, whatever the host", () => {
    expect(pathFlavour("win32").join("C:\\Users\\u", "gup")).toBe("C:\\Users\\u\\gup");
    expect(pathFlavour("darwin").join("/Users/u", "gup")).toBe("/Users/u/gup");
    expect(pathFlavour("freebsd")).toBe(path.posix);
  });

  it("defaults to the platform the process reports at call time", () => {
    setPlatform("win32");
    expect(pathFlavour()).toBe(path.win32);
    setPlatform("linux");
    expect(pathFlavour()).toBe(path.posix);
  });
});
