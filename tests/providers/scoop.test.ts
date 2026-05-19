import { describe, it, expect } from "vitest";
import { parseScoopStatus } from "../../src/providers/os/scoop.js";

describe("parseScoopStatus", () => {
  it("parses the standard scoop status table", () => {
    const out = `
Scoop is up to date.

Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
gh        2.40.0             2.42.1
nodejs    20.10.0            20.11.1
`;
    const pkgs = parseScoopStatus(out);
    expect(pkgs).toEqual([
      { id: "gh", name: "gh", current: "2.40.0", latest: "2.42.1" },
      { id: "nodejs", name: "nodejs", current: "20.10.0", latest: "20.11.1" },
    ]);
  });

  it("captures the trailing Info column as a note", () => {
    const out = `
Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
yt-dlp    2023.12.30         2024.03.10                            Held package
`;
    const pkgs = parseScoopStatus(out);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.note).toBe("Held package");
  });

  it("ignores rows where installed == latest", () => {
    const out = `
Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
gh        2.42.1             2.42.1
`;
    expect(parseScoopStatus(out)).toEqual([]);
  });

  it("returns [] when the header is absent", () => {
    expect(parseScoopStatus("Scoop is up to date.\n")).toEqual([]);
  });

  it("stops at the first blank line after rows", () => {
    const out = `
Name      Installed Version  Latest Version  Missing Dependencies  Info
----      -----------------  --------------  --------------------  ----
gh        2.40.0             2.42.1

something else entirely
`;
    expect(parseScoopStatus(out).map((p) => p.id)).toEqual(["gh"]);
  });
});
