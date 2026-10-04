import { describe, expect, it } from "vitest";
import { fitHints } from "../../../src/ui/tui/chrome.js";

const HINTS = "↑↓ naviguer · espace cocher · / filtrer · r rescanner";
const PINNED = "tab menu · q quitter";

describe("fitHints", () => {
  it("keeps every hint when the bar is wide enough", () => {
    expect(fitHints(HINTS, PINNED, 80)).toBe(`${HINTS} · ${PINNED}`);
  });

  it("cuts the last hints, never a word, and keeps the global keys whole", () => {
    expect(fitHints(HINTS, PINNED, 60)).toBe(
      "↑↓ naviguer · espace cocher · … · tab menu · q quitter",
    );
  });

  it("keeps only the global keys when no hint fits beside them", () => {
    expect(fitHints(HINTS, PINNED, 30)).toBe("… · tab menu · q quitter");
  });

  it("cuts a screen's own hints from the end when nothing is pinned", () => {
    expect(fitHints(HINTS, "", 31)).toBe("↑↓ naviguer · espace cocher · …");
  });
});
