import { describe, expect, it } from "vitest";
import { Totp } from "../../src/auth/totp.js";
import { base32Decode, base32Encode } from "../../src/security/base32.js";

/** RFC 6238 appendix B: the SHA-1 key and its 8-digit codes. */
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_VECTORS: ReadonlyArray<readonly [number, string]> = [
  [59, "94287082"],
  [1_111_111_109, "07081804"],
  [1_111_111_111, "14050471"],
  [1_234_567_890, "89005924"],
  [2_000_000_000, "69279037"],
  [20_000_000_000, "65353130"],
];
const STEP_MS = 30_000;

function at(seconds: number): Date {
  return new Date(seconds * 1000);
}

describe("Totp", () => {
  it.each(RFC_VECTORS)("gives the RFC 6238 code at T=%i", (seconds, code) => {
    const totp = new Totp(RFC_SECRET, { digits: 8 });
    expect(totp.codeAt(totp.counterAt(at(seconds)))).toBe(code);
  });

  it("matches the current step and one either side, and says which", () => {
    const totp = new Totp(RFC_SECRET);
    const now = at(1_234_567_890);
    const current = totp.counterAt(now);
    expect(totp.match(totp.codeAt(current), now)).toBe(current);
    expect(totp.match(totp.codeAt(current - 1), now)).toBe(current - 1);
    expect(totp.match(totp.codeAt(current + 1), now)).toBe(current + 1);
    expect(totp.match(totp.codeAt(current - 2), now)).toBeNull();
    expect(totp.match(totp.codeAt(current + 2), now)).toBeNull();
  });

  it("refuses a code of another length", () => {
    const totp = new Totp(RFC_SECRET);
    const now = at(59);
    expect(totp.match(totp.codeAt(totp.counterAt(now)).slice(1), now)).toBeNull();
    expect(totp.match("", now)).toBeNull();
  });

  it("refuses a secret shorter than 128 bits", () => {
    expect(() => new Totp(Buffer.alloc(15))).toThrow(/16 bytes/);
  });

  it("moves to the next code every 30 seconds", () => {
    const totp = new Totp(RFC_SECRET);
    expect(totp.counterAt(new Date(STEP_MS - 1))).toBe(0);
    expect(totp.counterAt(new Date(STEP_MS))).toBe(1);
  });
});

describe("base32", () => {
  it("encodes the RFC 4648 test vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Encode(Buffer.from("f"))).toBe("MY");
    expect(base32Encode(Buffer.alloc(0))).toBe("");
  });

  it("decodes what it encodes, whatever the case, spaces, dashes or padding", () => {
    const bytes = Buffer.from("12345678901234567890");
    const encoded = base32Encode(bytes);
    expect(base32Decode(encoded)).toEqual(bytes);
    expect(base32Decode(`${encoded.toLowerCase().replace(/(.{4})/g, "$1 ")}====`)).toEqual(bytes);
    expect(base32Decode("MZXW-6YTB-OI")).toEqual(Buffer.from("foobar"));
  });

  it("throws on a character outside the alphabet", () => {
    expect(() => base32Decode("MZXW1")).toThrow(/"1"/);
  });
});
