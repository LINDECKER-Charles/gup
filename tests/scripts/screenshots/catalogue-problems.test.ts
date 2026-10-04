import { describe, expect, it } from "vitest";
import { appFixture } from "../../../scripts/screenshots/fixtures/app-fixture.js";
import { SCENES } from "../../../scripts/screenshots/scenes/catalog.js";
import { catalogueProblems } from "../../../scripts/screenshots/scenes/catalogue-problems.js";
import type { Scene } from "../../../scripts/screenshots/scenes/scene.js";

function scene(overrides: Partial<Scene>): Scene {
  return {
    id: "packages-select",
    title: "gup — Packages",
    alt: "The Packages view.",
    size: { cols: 100, rows: 28 },
    fixture: () => appFixture(),
    play: async () => {},
    ...overrides,
  };
}

describe("catalogueProblems", () => {
  it("accepts the shipped catalogue", () => {
    expect(catalogueProblems(SCENES)).toEqual([]);
  });

  it("refuses an id that is not a plain file stem, or that is used twice", () => {
    const problems = catalogueProblems([
      scene({ id: "../../README" }),
      scene({ id: "Packages" }),
      scene({ id: "options" }),
      scene({ id: "options" }),
    ]);
    expect(problems).toEqual([
      "../../README: the id is not kebab-case",
      "Packages: the id is not kebab-case",
      "options: the id is used twice",
    ]);
  });

  it("refuses an empty or overlong alt text and an unreadable size", () => {
    const problems = catalogueProblems([
      scene({ id: "blank", alt: "  " }),
      scene({ id: "long", alt: "x".repeat(251) }),
      scene({ id: "tiny", size: { cols: 60, rows: 28 } }),
    ]);
    expect(problems).toEqual([
      "blank: the alt text must hold 1 to 250 characters",
      "long: the alt text must hold 1 to 250 characters",
      "tiny: 60 × 28 is outside 80–140 × 20–40",
    ]);
  });
});
