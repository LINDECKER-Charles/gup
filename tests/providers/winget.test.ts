import { describe, it, expect } from "vitest";
import { parseWingetTable } from "../../src/providers/os/winget.js";

const EN_TABLE = `
Name                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
Microsoft Edge                    Microsoft.Edge              120.0.2210.91 121.0.2277.83 winget
Node.js LTS                       OpenJS.NodeJS.LTS           20.10.0       20.11.0       winget
12 upgrades available.
`;

const FR_TABLE = `
Nom                               Id                          Version       Disponible    Source
-------------------------------------------------------------------------------------------------
Google Chrome                     Google.Chrome               120.0.6099.71 121.0.6167.85 winget
Git                               Git.Git                     2.43.0        2.44.0        winget
2 mises à jour disponibles.
`;

const PINNED_SECOND_TABLE = `
Name                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
Microsoft Edge                    Microsoft.Edge              120.0.2210.91 121.0.2277.83 winget

The following packages have pinned versions and require explicit targeting:
Name                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
PowerToys                         Microsoft.PowerToys         0.75.0        0.76.0        winget
`;

const SPINNER_NOISE = `\r-\r\\\r|\rName                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
Foo                               Foo.Bar                     1.0.0         2.0.0         winget
`;

describe("parseWingetTable", () => {
  it("parses the English column layout", () => {
    const rows = parseWingetTable(EN_TABLE);
    expect(rows).toEqual([
      {
        name: "Microsoft Edge",
        id: "Microsoft.Edge",
        version: "120.0.2210.91",
        available: "121.0.2277.83",
      },
      {
        name: "Node.js LTS",
        id: "OpenJS.NodeJS.LTS",
        version: "20.10.0",
        available: "20.11.0",
      },
    ]);
  });

  it("parses the French column layout (Nom / Disponible)", () => {
    const rows = parseWingetTable(FR_TABLE);
    expect(rows.map((r) => r.id)).toEqual(["Google.Chrome", "Git.Git"]);
    expect(rows[0]?.name).toBe("Google Chrome");
    expect(rows[1]?.available).toBe("2.44.0");
  });

  it("parses BOTH tables when winget emits a second pinned-upgrades section", () => {
    const rows = parseWingetTable(PINNED_SECOND_TABLE);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("Microsoft.Edge");
    expect(ids).toContain("Microsoft.PowerToys");
  });

  it("does not glue spinner carriage-return frames onto the header", () => {
    const rows = parseWingetTable(SPINNER_NOISE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("Foo.Bar");
  });

  it("returns [] when no header is present", () => {
    expect(parseWingetTable("garbage output\nfoo bar")).toEqual([]);
  });

  it("deduplicates rows with the same Id across tables", () => {
    const dup = `
Name                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
Foo                               Foo.Bar                     1.0.0         2.0.0         winget

Name                              Id                          Version       Available     Source
-------------------------------------------------------------------------------------------------
Foo                               Foo.Bar                     1.0.0         2.0.0         winget
`;
    const rows = parseWingetTable(dup);
    expect(rows).toHaveLength(1);
  });
});
