import { describe, it, expect } from "vitest";
import { parseChocoOutdated } from "../../src/providers/os/choco.js";

describe("parseChocoOutdated", () => {
  it("parses the pipe-separated -r --limit-output format", () => {
    const stdout =
      "git|2.43.0|2.44.0|false\nnodejs|20.10.0|20.11.0|false\n";
    const pkgs = parseChocoOutdated(stdout);
    expect(pkgs).toEqual([
      { id: "git", name: "git", current: "2.43.0", latest: "2.44.0" },
      { id: "nodejs", name: "nodejs", current: "20.10.0", latest: "20.11.0" },
    ]);
  });

  it("flags pinned packages with a note", () => {
    const stdout = "vlc|3.0.18|3.0.20|true\n";
    const pkgs = parseChocoOutdated(stdout);
    expect(pkgs[0]?.note).toBe("pinned");
  });

  it("skips Chocolatey banner lines", () => {
    const stdout =
      "Chocolatey v2.2.2\nChocolatey upgraded 0/0 packages.\ngit|2.43.0|2.44.0|false\n";
    expect(parseChocoOutdated(stdout).map((p) => p.id)).toEqual(["git"]);
  });

  it("ignores rows where current == latest", () => {
    const stdout = "git|2.44.0|2.44.0|false\n";
    expect(parseChocoOutdated(stdout)).toEqual([]);
  });

  it("ignores malformed rows missing fields", () => {
    const stdout = "broken|only-two\n";
    expect(parseChocoOutdated(stdout)).toEqual([]);
  });
});
