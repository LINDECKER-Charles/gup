import { describe, expect, it } from "vitest";
import { createFieldReader, type ConfigIssue } from "../../../src/core/config/field-reader.js";

function reader(raw: unknown) {
  const issues: ConfigIssue[] = [];
  return { read: createFieldReader(raw, "interface", issues), issues };
}

/** The problems recorded, as the user reads them. */
const worded = (issues: readonly ConfigIssue[]): string[] => issues.map((issue) => issue());

describe("createFieldReader", () => {
  it("returns present valid values and silently falls back for absent ones", () => {
    const { read, issues } = reader({ mouse: false, density: "compact", timeout: 600 });
    expect(read.boolean("mouse", true)).toBe(false);
    expect(read.boolean("animations", true)).toBe(true);
    expect(read.oneOf("density", ["comfortable", "compact"], "comfortable")).toBe("compact");
    expect(read.integer("timeout", { min: 0, max: 86_400 }, 1200)).toBe(600);
    expect(issues).toEqual([]);
  });

  it("falls back and names the field when a value has the wrong shape", () => {
    const { read, issues } = reader({ mouse: "yes", density: "huge", timeout: 1.5 });
    expect(read.boolean("mouse", true)).toBe(true);
    expect(read.oneOf("density", ["comfortable", "compact"], "comfortable")).toBe("comfortable");
    expect(read.integer("timeout", { min: 0, max: 86_400 }, 1200)).toBe(1200);
    expect(worded(issues)).toEqual([
      "interface.mouse : booléen attendu",
      "interface.density : une valeur parmi comfortable, compact attendue",
      "interface.timeout : entier entre 0 et 86400 attendu",
    ]);
  });

  it("rejects an integer outside its bounds", () => {
    const { read, issues } = reader({ timeout: 90_000 });
    expect(read.integer("timeout", { min: 0, max: 86_400 }, 1200)).toBe(1200);
    expect(issues).toHaveLength(1);
  });

  it("normalises colours to upper-case #RRGGBB and refuses anything else", () => {
    const { read, issues } = reader({ accent: "#f80", danger: "#b00020", border: "red" });
    expect(read.hexColor("accent")).toBe("#FF8800");
    expect(read.hexColor("danger")).toBe("#B00020");
    expect(read.hexColor("border")).toBeUndefined();
    expect(read.hexColor("missing")).toBeUndefined();
    expect(worded(issues)).toEqual(["interface.border : couleur #RRGGBB attendue"]);
  });

  it("keeps valid, de-duplicated ids up to the bound", () => {
    const bounds = { max: 2, pattern: /^[a-z-]+$/ };
    const { read, issues } = reader({ filter: ["winget", "BAD", "winget", "npm-g", "scoop"] });
    expect(read.ids("filter", bounds)).toEqual(["winget", "npm-g"]);
    expect(worded(issues)).toEqual(["interface.filter : identifiants invalides ignorés"]);
    expect(reader({ filter: "winget" }).read.ids("filter", bounds)).toEqual([]);
  });

  it("reads nested objects with a qualified path, and an empty reader for a bad one", () => {
    const { read, issues } = reader({ custom: { dark: { accent: "#123" } }, broken: 3 });
    expect(read.object("custom").object("dark").hexColor("accent")).toBe("#112233");
    expect(read.object("broken").keys()).toEqual([]);
    expect(worded(issues)).toEqual(["interface.broken : objet attendu"]);
  });

  it("never exposes prototype-polluting keys", () => {
    const raw = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "ok": true}');
    const { read } = reader(raw);
    expect(read.keys()).toEqual(["ok"]);
    expect(read.object("__proto__").keys()).toEqual([]);
    expect(read.boolean("constructor", false)).toBe(false);
  });

  it("treats a non-object source as empty", () => {
    expect(reader([1, 2]).read.keys()).toEqual([]);
    expect(reader(null).read.boolean("x", true)).toBe(true);
  });
});
