import { describe, expect, it } from "vitest";
import { machinePathsIn } from "../../../scripts/screenshots/sandbox/machine-paths.js";

/** The rendering machine, as the guard would read it on a Windows developer's box. */
const MACHINE = ["C:\\Users\\alex", "C:\\Users\\alex\\AppData\\Local\\Temp", "D:\\src\\gup"];

describe("machinePathsIn", () => {
  it("finds the machine's paths whatever their separators or case", () => {
    const frame = [
      "Fichier  c:/users/ALEX/AppData/Roaming/gup/config.json",
      "export écrit — D:\\src\\gup\\report.html",
    ].join("\n");
    expect(machinePathsIn(frame, MACHINE)).toEqual(["C:\\Users\\alex", "D:\\src\\gup"]);
  });

  it("lets the fixture's own neutral paths through", () => {
    const frame = "→ C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules";
    expect(machinePathsIn(frame, MACHINE)).toEqual([]);
  });

  it("never matches an empty path", () => {
    expect(machinePathsIn("any frame", [""])).toEqual([]);
  });
});
