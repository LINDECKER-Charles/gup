import { describe, expect, it } from "vitest";
import { ListCursor } from "../../../src/ui/tui/list-cursor.js";

describe("ListCursor", () => {
  it("starts on the first selectable row and skips the others when moving", () => {
    const cursor = new ListCursor([false, true, false, true]);
    expect(cursor.index).toBe(1);
    cursor.move(1);
    expect(cursor.index).toBe(3);
  });

  it("stops at either end instead of wrapping", () => {
    const cursor = new ListCursor([true, true, true], 2);
    cursor.move(5);
    expect(cursor.index).toBe(2);
    cursor.move(-5);
    expect(cursor.index).toBe(0);
  });

  it("reports -1 when nothing can be selected", () => {
    expect(new ListCursor([false, false]).index).toBe(-1);
  });

  it("windows a long list so that the cursor stays visible", () => {
    const cursor = new ListCursor(Array.from({ length: 30 }, () => true), 20);
    const { start, end } = cursor.window(10);
    expect(end - start).toBe(10);
    expect(cursor.index).toBeGreaterThanOrEqual(start);
    expect(cursor.index).toBeLessThan(end);
    expect(new ListCursor([true, true, true]).window(10)).toEqual({ start: 0, end: 3 });
  });
});
