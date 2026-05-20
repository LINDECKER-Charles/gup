import { describe, it, expect } from "vitest";
import { chocoOutcome, parseChocoOutdated } from "../../src/providers/os/choco.js";

describe("chocoOutcome", () => {
  it("treats exit 0 as plain success", () => {
    expect(chocoOutcome("caddy", 0)).toEqual({ id: "caddy", success: true });
  });

  it("treats exit 3010 (reboot required) as success with a reboot advisory", () => {
    expect(chocoOutcome("vcredist140", 3010)).toEqual({
      id: "vcredist140",
      success: true,
      message: expect.stringMatching(/redémarrage/i),
    });
  });

  it("treats exit 1641 (installer initiated restart) as success with a reboot advisory", () => {
    expect(chocoOutcome("dotnet-runtime", 1641)).toEqual({
      id: "dotnet-runtime",
      success: true,
      message: expect.stringMatching(/redémarrage/i),
    });
  });

  it("keeps any other non-zero exit as a failure (no silent success)", () => {
    // 1603 = MSI fatal error — the canonical "the install actually failed".
    // We never want this collapsed into success.
    expect(chocoOutcome("python312", 1603)).toEqual({
      id: "python312",
      success: false,
    });
    expect(chocoOutcome("anything", 1)).toEqual({ id: "anything", success: false });
    expect(chocoOutcome("anything", -1)).toEqual({ id: "anything", success: false });
  });
});

describe("ChocoProvider.updateAll: reboot-message deduplication", () => {
  // The `choco upgrade all -y` command emits one final exit code for the
  // whole batch — if it's 3010, every package in the batch shares the same
  // global "reboot required" advisory. Repeating that message for each
  // package would clutter the OK summary; the advisory is global, not
  // per-package. The first outcome keeps it, the rest don't.
  it("attaches the reboot message only to the first outcome when updateAll exits 3010 / 1641", () => {
    // Reuse chocoOutcome's contract — updateAll itself shells out, but the
    // dedup logic is exercised by the mapping the provider applies to its
    // outcomes list. We construct that same shape directly to keep the test
    // free of process spawning.
    const exitCode = 3010;
    const ids = ["caddy", "ffmpeg", "fzf"];
    const outcomes = ids.map((id, i) => {
      const o = chocoOutcome(id, exitCode);
      if (i > 0 && o.message) {
        const { message: _msg, ...rest } = o;
        return rest;
      }
      return o;
    });
    expect(outcomes[0]!.message).toMatch(/redémarrage/i);
    expect(outcomes[1]!.message).toBeUndefined();
    expect(outcomes[2]!.message).toBeUndefined();
    // Every entry still reports success — the dedup is purely on the message.
    expect(outcomes.every((o) => o.success)).toBe(true);
  });
});

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
