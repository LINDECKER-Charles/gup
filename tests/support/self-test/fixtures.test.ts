import { describe, expect, it } from "vitest";
import { resolveText } from "../fixtures/load.js";
import {
  findSecrets,
  hostRedactionContext,
  redact,
  type RedactionContext,
} from "../fixtures/redact.js";
import { fixture, fixtureFile, golden, isFixtureRef, isGoldenRef } from "../fixtures/refs.js";

const WINDOWS_MACHINE: RedactionContext = {
  user: "user",
  host: "HOST",
  home: "C:\\Users\\user",
  isCaseInsensitive: true,
};

describe("fixture references", () => {
  it("references files under tests/fixtures and goldens under the domain's __golden__", () => {
    expect(fixtureFile(fixture("providers/os/winget/upgrade.win32.txt"))).toMatch(
      /tests[\\/]fixtures[\\/]providers[\\/]os[\\/]winget[\\/]upgrade\.win32\.txt$/,
    );
    expect(golden("os", "winget.upgrade").file).toMatch(
      /tests[\\/]providers[\\/]os[\\/]__golden__[\\/]winget\.upgrade\.json$/,
    );
  });

  it.each(["../secrets.txt", "/etc/passwd", "C:\\x.txt", "a/../../b", "a//b", ""])(
    "refuses a path that is not plain and relative: %j",
    (path) => {
      expect(() => fixture(path)).toThrow("plain relative path");
    },
  );

  it("refuses a golden name that could escape its folder", () => {
    expect(() => golden("os", "../../x")).toThrow("plain relative path");
  });

  it("tells references apart", () => {
    expect(isFixtureRef(fixture("a.txt"))).toBe(true);
    expect(isGoldenRef(fixture("a.txt"))).toBe(false);
    expect(isGoldenRef(golden("os", "x"))).toBe(true);
    expect(isFixtureRef("a.txt")).toBe(false);
  });

  it("resolves inline text as is and a fixture from the real repository", async () => {
    await expect(resolveText("inline")).resolves.toBe("inline");
    const recorded = fixture("self-test/hello.txt");

    await expect(resolveText(recorded)).resolves.toBe("hello from a fixture\n");
  });
});

describe("redaction", () => {
  it("replaces the home directory in both separator styles, whatever its case on Windows", () => {
    const { text, counts } = redact(
      "C:\\Users\\user\\scoop\\shims · c:/users/USER/.cargo/bin",
      WINDOWS_MACHINE,
    );

    expect(text).toBe("<HOME>\\scoop\\shims · <HOME>/.cargo/bin");
    expect(counts["<HOME>"]).toBe(2);
  });

  it("replaces the home directory a JSON report escaped", () => {
    const report = JSON.stringify({ location: "C:\\Users\\user\\AppData\\Roaming\\npm" });
    const { text, counts } = redact(report, WINDOWS_MACHINE);

    expect(JSON.parse(text)).toEqual({ location: "<HOME>\\AppData\\Roaming\\npm" });
    expect(counts).toEqual({ "<HOME>": 1, "<USER>": 0, "<HOST>": 0 });
  });

  it("replaces the user and host names only where they stand alone", () => {
    const { text, counts } = redact(
      "owner user on HOST · charlotte · user.dev · xcharl",
      WINDOWS_MACHINE,
    );

    expect(text).toBe("owner <USER> on <HOST> · charlotte · <USER>.dev · xcharl");
    expect(counts).toEqual({ "<HOME>": 0, "<USER>": 2, "<HOST>": 1 });
  });

  it("leaves a longer home that merely starts with the real one alone", () => {
    expect(redact("C:\\Users\\charlie\\x", WINDOWS_MACHINE).text).toBe("C:\\Users\\charlie\\x");
  });

  it("matches POSIX names case-sensitively", () => {
    const mac: RedactionContext = {
      user: "u",
      host: "mbp",
      home: "/Users/u",
      isCaseInsensitive: false,
    };

    expect(redact("/Users/u/bin /USERS/U/bin U u", mac).text).toBe(
      "<HOME>/bin /USERS/U/bin U <USER>",
    );
  });

  it("describes the machine running the recorder", () => {
    const context = hostRedactionContext();

    expect(context.user.length).toBeGreaterThan(0);
    expect(context.host.length).toBeGreaterThan(0);
    expect(context.isCaseInsensitive).toBe(process.platform === "win32");
  });
});

describe("secret scan", () => {
  it.each([
    ["github token", `token ghp_${"a".repeat(36)}`],
    ["github fine-grained token", `github_pat_${"A1_".repeat(10)}`],
    ["aws access key", "key AKIAABCDEFGHIJKLMNOP"],
    ["slack token", "xoxb-1234-abcd"],
    ["private key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
    ["npm token", `npm_${"Z".repeat(36)}`],
    ["e-mail address", "maintainer: someone@example.org"],
  ])("finds a %s", (kind, text) => {
    expect(findSecrets(text).map((hit) => hit.kind)).toEqual([kind]);
  });

  it("finds nothing in ordinary tool output", () => {
    const output = [
      "Name               Id                 Version   Available Source",
      "Git                Git.Git            2.45.0    2.46.0    winget",
      "typescript 5.4.5 → 5.5.2 (npm_config_prefix set)",
      "ghp_short is not a token · user@localhost has no TLD",
    ].join("\n");

    expect(findSecrets(output)).toEqual([]);
  });

  it("reports hits in text order", () => {
    const hits = findSecrets("a@example.org then AKIAABCDEFGHIJKLMNOP");

    expect(hits.map((hit) => hit.kind)).toEqual(["e-mail address", "aws access key"]);
  });
});
