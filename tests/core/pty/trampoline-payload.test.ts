import { describe, expect, it } from "vitest";
import {
  decodePayload,
  encodePayload,
  MAX_PAYLOAD_CHARS,
  PAYLOAD_VERSION,
  type TrampolinePayload,
} from "../../../src/core/pty/trampoline-payload.js";

/**
 * The trampoline's single argument: what crosses the pseudo-terminal's
 * command line must be inert (base64url only) and must come back exactly as
 * sent, or not at all.
 */

const FULL: TrampolinePayload = {
  v: PAYLOAD_VERSION,
  command: "C:\\Program Files (x86)\\Tool\\tool.exe",
  args: ["install", "with space", 'qu"ote', "a&b|c^d%PATH%", "accents éàî", "", "tab\tline\nbreak"],
  cwd: "C:\\Users\\Jérôme\\Downloads",
  shell: false,
  exitFile: "C:\\Temp\\gup-pty-x\\0123.exit",
  locale: "fr",
};

const encodeRaw = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

describe("trampoline payload", () => {
  it("round-trips a request with every optional field", () => {
    expect(decodePayload(encodePayload(FULL))).toEqual(FULL);
  });

  it("round-trips a minimal request without inventing fields", () => {
    const minimal: TrampolinePayload = { v: PAYLOAD_VERSION, command: "winget", args: [] };
    expect(decodePayload(encodePayload(minimal))).toStrictEqual(minimal);
  });

  it("puts only base64url characters on the command line", () => {
    expect(encodePayload(FULL)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses to encode a request that would not fit on the command line", () => {
    const huge: TrampolinePayload = {
      v: PAYLOAD_VERSION,
      command: "npm",
      args: ["x".repeat(MAX_PAYLOAD_CHARS)],
    };
    expect(() => encodePayload(huge)).toThrow(RangeError);
  });

  it.each([
    ["an empty argument", ""],
    ["standard base64 characters", `${encodePayload(FULL)}+/=`],
    ["a quote", `${encodePayload(FULL)}"`],
    ["an oversized argument", "A".repeat(MAX_PAYLOAD_CHARS + 1)],
    ["something that is not JSON", Buffer.from("not json").toString("base64url")],
  ])("refuses %s", (_label, encoded) => {
    expect(() => decodePayload(encoded)).toThrow();
  });

  it.each([
    ["another version", { v: 2, command: "npm", args: [] }],
    ["a missing version", { command: "npm", args: [] }],
    ["an array", [1, "npm"]],
    ["an empty command", { v: 1, command: "", args: [] }],
    ["a non-string command", { v: 1, command: 42, args: [] }],
    ["a non-array args", { v: 1, command: "npm", args: "install" }],
    ["a non-string argument", { v: 1, command: "npm", args: ["install", 3] }],
    ["a non-string cwd", { v: 1, command: "npm", args: [], cwd: 1 }],
    ["a non-boolean shell", { v: 1, command: "npm", args: [], shell: "yes" }],
    ["a non-string exit file", { v: 1, command: "npm", args: [], exitFile: true }],
    ["a language gup does not speak", { v: 1, command: "npm", args: [], locale: "de" }],
    ["a language tag instead of its code", { v: 1, command: "npm", args: [], locale: "fr-CA" }],
    ["a non-string language", { v: 1, command: "npm", args: [], locale: ["en"] }],
    ["an unknown field", { v: 1, command: "npm", args: [], env: { PATH: "x" } }],
    ["a prototype key", JSON.parse('{"v":1,"command":"npm","args":[],"__proto__":{"shell":true}}')],
  ])("refuses a payload with %s", (_label, value) => {
    expect(() => decodePayload(encodeRaw(value))).toThrow(/pty payload/);
  });
});
