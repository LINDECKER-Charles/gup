import { describe, expect, it } from "vitest";
import { LineSplitter, TRUNCATED_OUTPUT_LINE } from "../../../src/core/process/line-splitter.js";

function split(capBytes: number) {
  const lines: string[] = [];
  const splitter = new LineSplitter({ capBytes, onLine: (line) => lines.push(line) });
  return { lines, splitter };
}

describe("LineSplitter", () => {
  it("ends lines on LF, CRLF and a lone CR, and drops blank lines", () => {
    const { lines, splitter } = split(1024);
    splitter.push("one\ntwo\r\nthree\r 50%\r100%\n\n");
    expect(lines).toEqual(["one", "two", "three", " 50%", "100%"]);
  });

  it("joins a line split across chunks, including a CRLF cut in two", () => {
    const { lines, splitter } = split(1024);
    splitter.push("Télécharge");
    splitter.push("ment\r");
    splitter.push("\nfin");
    splitter.end();
    expect(lines).toEqual(["Téléchargement", "fin"]);
  });

  it("emits the unterminated last line on end, once", () => {
    const { lines, splitter } = split(1024);
    splitter.push("partial");
    splitter.end();
    splitter.end();
    expect(lines).toEqual(["partial"]);
  });

  it("stops at the byte cap with a single truncation line", () => {
    const { lines, splitter } = split(10);
    splitter.push("12345\n");
    splitter.push("67890\nabc\n");
    splitter.push("more\n");
    splitter.end();
    expect(lines).toEqual(["12345", TRUNCATED_OUTPUT_LINE]);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const { lines, splitter } = split(6);
    splitter.push("ééé\n");
    expect(lines).toEqual([TRUNCATED_OUTPUT_LINE]);
  });

  it("bounds a line that never ends", () => {
    const { lines, splitter } = split(8);
    splitter.push("x".repeat(20));
    splitter.push("y".repeat(20));
    expect(lines).toEqual([TRUNCATED_OUTPUT_LINE]);
  });
});
