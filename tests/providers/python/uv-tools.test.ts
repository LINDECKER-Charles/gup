import { describe, expect, it } from "vitest";
import { UvToolsProvider } from "../../../src/providers/python/uv-tools.js";
import { system } from "../../support/system/fake-system.js";
import { pypiRoute, uvMachine } from "./python.cases.js";

/** `uv tool list`: a `<tool> v<version>` line, then one `- <executable>` line each. */

describe("UvToolsProvider.isAvailable", () => {
  it("stays hidden when uv is there but cannot list its tools", async () => {
    await system.load(uvMachine({ exitCode: 2, stderr: "error: unrecognized subcommand 'tool'" }));
    await expect(new UvToolsProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("UvToolsProvider.listOutdated", () => {
  it("asks PyPI nothing when no line names a tool", async () => {
    await system.load(uvMachine({ stdout: "- foo\n\n- bar\n" }));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a tool whose PyPI answer names no version, or has no info at all", async () => {
    const noInfo = { url: pypiRoute("black").url, json: {} };
    const listing = { stdout: "ruff v0.5.0\n- ruff\nblack v24.0.0\n- black" };
    await system.load(uvMachine(listing, [pypiRoute("ruff"), noInfo]));
    await expect(new UvToolsProvider().listOutdated()).resolves.toEqual([]);
  });
});
