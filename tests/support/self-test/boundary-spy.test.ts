import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { replaceForTest } from "../system/boundary-spy.js";
import { system } from "../system/fake-system.js";

const MARKER = "/opt/marker";

/** The order matters: the second test proves the first one's replacement is gone. */
describe("replaceForTest", () => {
  it("replaces a faked boundary function for the current test", async () => {
    await system.load({ platform: "linux", fs: { [MARKER]: { kind: "file" } } });
    replaceForTest(fs, "existsSync", () => {
      throw new Error("EPERM");
    });
    expect(() => fs.existsSync(MARKER)).toThrow("EPERM");
  });

  it("restores the fake once that test is over", async () => {
    await system.load({ platform: "linux", fs: { [MARKER]: { kind: "file" } } });
    expect(fs.existsSync(MARKER)).toBe(true);
  });
});
