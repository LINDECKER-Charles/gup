import { describe, expect, it } from "vitest";
import { createFieldReader, type ConfigIssue } from "../../../src/core/config/field-reader.js";

/** The problems recorded, as the user reads them. */
const worded = (issues: readonly ConfigIssue[]): string[] => issues.map((issue) => issue());

// The readers added for sections that hold records (the scheduler's
// schedules) rather than flat settings: bounded text, lists of objects, and
// the JSON type of a field that admits two.

describe("FieldReader.text", () => {
  it("returns a string within bounds and undefined when absent", () => {
    const issues: ConfigIssue[] = [];
    const read = createFieldReader({ name: "Outils dev" }, "s", issues);
    expect(read.text("name", { maxLength: 60 })).toBe("Outils dev");
    expect(read.text("missing", { maxLength: 60 })).toBeUndefined();
    expect(issues).toEqual([]);
  });

  it("refuses wrong types, overlong values, control characters and pattern mismatches", () => {
    const issues: ConfigIssue[] = [];
    const read = createFieldReader(
      { number: 3, long: "x".repeat(5), control: "a\u0007b", id: "ZZ" },
      "s",
      issues,
    );
    expect(read.text("number", { maxLength: 4 })).toBeUndefined();
    expect(read.text("long", { maxLength: 4 })).toBeUndefined();
    expect(read.text("control", { maxLength: 4 })).toBeUndefined();
    expect(read.text("id", { maxLength: 4, pattern: /^[a-f]+$/ })).toBeUndefined();
    expect(worded(issues)).toEqual([
      "s.number : texte de 4 caractères au plus attendu",
      "s.long : texte de 4 caractères au plus attendu",
      "s.control : texte de 4 caractères au plus attendu",
      "s.id : texte de 4 caractères au plus attendu",
    ]);
  });
});

describe("FieldReader.objects", () => {
  it("reads each object of a list with an indexed path", () => {
    const issues: ConfigIssue[] = [];
    const read = createFieldReader({ items: [{ v: true }, 4, { v: "no" }] }, "s", issues);
    const items = read.objects("items", 10);
    expect(items.map((item) => item.boolean("v", false))).toEqual([true, false]);
    expect(worded(issues)).toEqual([
      "s.items : entrées invalides ignorées",
      "s.items[2].v : booléen attendu",
    ]);
  });

  it("truncates to the bound and refuses a non-list", () => {
    const issues: ConfigIssue[] = [];
    const read = createFieldReader({ items: [{}, {}, {}], scalar: "x" }, "s", issues);
    expect(read.objects("items", 2)).toHaveLength(2);
    expect(read.objects("scalar", 2)).toEqual([]);
    expect(read.objects("absent", 2)).toEqual([]);
    expect(worded(issues)).toEqual(["s.items : 2 entrées au plus", "s.scalar : liste attendue"]);
  });
});

describe("FieldReader.kindOf", () => {
  it("names the JSON type of a present value without recording anything", () => {
    const issues: ConfigIssue[] = [];
    const read = createFieldReader(
      { s: "last", n: 15, b: true, z: null, a: [], o: {}, __proto__: { x: 1 } },
      "s",
      issues,
    );
    expect(["s", "n", "b", "z", "a", "o", "missing"].map((key) => read.kindOf(key))).toEqual([
      "string",
      "number",
      "boolean",
      "null",
      "array",
      "object",
      undefined,
    ]);
    expect(read.kindOf("__proto__")).toBeUndefined();
    expect(issues).toEqual([]);
  });
});
