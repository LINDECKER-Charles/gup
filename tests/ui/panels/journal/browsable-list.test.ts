import { describe, expect, it } from "vitest";
import { BrowsableList } from "../../../../src/ui/panels/journal/browsable-list.js";
import type { KeyPress } from "../../../../src/ui/tui/screen-host.js";

const key = (name: string): KeyPress => ({ name, ctrl: false, sequence: name.length === 1 ? name : "" });
const LETTERS = Array.from({ length: 30 }, (_unused, index) => `item-${index}`);

function list(items: readonly string[] = LETTERS) {
  const browsable = new BrowsableList<string>({ searchText: (item) => item.toUpperCase() });
  browsable.setItems(items);
  return browsable;
}

describe("BrowsableList", () => {
  it("moves a cursor that stops at both ends", () => {
    const browsable = list();

    browsable.press(key("up"));
    expect(browsable.cursor).toBe(0);
    browsable.press(key("pagedown"));
    browsable.press(key("j"));
    expect(browsable.current).toBe("item-11");
    browsable.press(key("end"));
    browsable.press(key("down"));
    expect(browsable.current).toBe("item-29");
    browsable.press(key("home"));
    expect(browsable.current).toBe("item-0");
  });

  it("keeps the cursor in a centred window", () => {
    const browsable = list();
    browsable.moveTo(15);

    expect(browsable.window(10)).toEqual({ start: 10, end: 20 });
    browsable.moveTo(29);
    expect(browsable.window(10)).toEqual({ start: 20, end: 30 });
  });

  it("filters case-insensitively on the typed text, within the scope set", () => {
    const browsable = list();
    browsable.setScope((item) => Number(item.slice(5)) % 2 === 0);

    for (const name of ["/", "i", "t", "e", "m", "-", "1"]) browsable.press(key(name));

    expect(browsable.isModal).toBe(true);
    expect(browsable.visible).toEqual(["item-10", "item-12", "item-14", "item-16", "item-18"]);
    browsable.press(key("backspace"));
    browsable.press(key("return"));
    expect(browsable.isTyping).toBe(false);
    expect(browsable.visible).toHaveLength(15);
    expect(browsable.press(key("escape"))).toBe(true);
    expect(browsable.filter).toBe("");
    expect(browsable.press(key("escape"))).toBe(false);
  });

  it("opens a detail that scrolls, stops at its last page and closes with Échap", () => {
    const browsable = list();

    browsable.press(key("return"));
    expect(browsable.isDetailOpen).toBe(true);
    browsable.press(key("pagedown"));
    browsable.press(key("pagedown"));
    expect(browsable.detailStart(12, 5)).toBe(7);
    browsable.press(key("up"));
    expect(browsable.detailStart(12, 5)).toBe(6);
    expect(browsable.press(key("q"))).toBe(true);
    browsable.press(key("escape"));
    expect(browsable.isModal).toBe(false);
  });

  it("opens nothing on an empty list, and has no text filter without a search text", () => {
    const empty = list([]);
    expect(empty.press(key("return"))).toBe(false);

    const plain = new BrowsableList<string>();
    plain.setItems(LETTERS);
    expect(plain.press(key("/"))).toBe(false);
    expect(plain.isTyping).toBe(false);
  });
});
