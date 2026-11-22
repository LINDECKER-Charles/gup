import { describe, expect, it } from "vitest";
import { deriveInstallId } from "../../src/identity/derive-install-id.js";
import {
  InstallSignatureVerifier, type InstallRequest,
} from "../../src/identity/install-signature-verifier.js";
import { DURATION_MS } from "../../src/time-units.js";
import { InstallKey } from "../../scripts/lib/install-key.js";
import { ManualClock, PUBLIC_ORIGIN } from "../support/test-app.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const clock = new ManualClock();
const verifier = new InstallSignatureVerifier(PUBLIC_ORIGIN, clock);
const key = InstallKey.generate();
const pathname = `/api/installs/${key.installId}/logs`;
const body = Buffer.from('{"schema":1,"history":[],"logs":[]}');

/** A request as the CLI sends it, signed now for this service; `overrides` tamper with it. */
function signed(overrides: Partial<InstallRequest> = {}): InstallRequest {
  const authorization = key.authorization({
    method: "POST", origin: PUBLIC_ORIGIN, pathname, body, signedAtMs: clock.now().getTime(),
  });
  return { authorization, method: "POST", pathname, installId: key.installId, body, ...overrides };
}

function headerParts(): [string, string, string] {
  const [publicKey = "", ts = "", signature = ""] =
    (signed().authorization ?? "").replace("GupInstall ", "").split(".");
  return [publicKey, ts, signature];
}

describe("deriveInstallId", () => {
  it("follows the contract's derivation (pinned vector: 32 zero bytes)", () => {
    expect(deriveInstallId(Buffer.alloc(32))).toBe("66687aad-f862-4d77-ac8f-c18b8e9f8e20");
  });

  it("gives a lower-case UUID v4 for any key", () => {
    expect(key.installId).toMatch(UUID_V4);
    expect(deriveInstallId(key.rawPublicKey)).toBe(key.installId);
  });
});

describe("InstallSignatureVerifier", () => {
  it("accepts a request signed by the key the install ID derives from", () => {
    expect(verifier.isAuthentic(signed())).toBe(true);
  });

  it("accepts a delete with an empty body", () => {
    const empty = Buffer.alloc(0);
    const path = `/api/installs/${key.installId}`;
    const authorization = key.authorization({
      method: "DELETE", origin: PUBLIC_ORIGIN, pathname: path, body: empty,
      signedAtMs: clock.now().getTime(),
    });
    expect(verifier.isAuthentic({
      authorization, method: "DELETE", pathname: path, installId: key.installId, body: empty,
    })).toBe(true);
  });

  it.each([
    ["the body", { body: Buffer.from('{"schema":1,"history":[],"logs":[{}]}') }],
    ["the method", { method: "DELETE" }],
    ["the path", { pathname: `/api/installs/${key.installId}` }],
    ["the install ID", { installId: InstallKey.generate().installId }],
  ])("refuses a request whose %s changed after signing", (_name, tampered) => {
    expect(verifier.isAuthentic(signed(tampered))).toBe(false);
  });

  it("refuses a signature made for another origin", () => {
    const authorization = key.authorization({
      method: "POST", origin: "https://elsewhere.example.test", pathname, body,
      signedAtMs: clock.now().getTime(),
    });
    expect(verifier.isAuthentic(signed({ authorization }))).toBe(false);
  });

  it("refuses a time changed in the header", () => {
    const [publicKey, ts, signature] = headerParts();
    const authorization = `GupInstall ${publicKey}.${Number(ts) + 1}.${signature}`;
    expect(verifier.isAuthentic(signed({ authorization }))).toBe(false);
  });

  it("accepts a clock a day off, and refuses one further off", () => {
    const sign = (offsetMs: number) => key.authorization({
      method: "POST", origin: PUBLIC_ORIGIN, pathname, body,
      signedAtMs: clock.now().getTime() + offsetMs,
    });
    expect(verifier.isAuthentic(signed({ authorization: sign(-DURATION_MS.day) }))).toBe(true);
    expect(verifier.isAuthentic(signed({ authorization: sign(DURATION_MS.day + 1) }))).toBe(false);
  });

  it("refuses the key of another install, validly signed", () => {
    const other = InstallKey.generate();
    const authorization = other.authorization({
      method: "POST", origin: PUBLIC_ORIGIN, pathname, body, signedAtMs: clock.now().getTime(),
    });
    expect(verifier.isAuthentic(signed({ authorization }))).toBe(false);
  });

  it.each([
    ["no header", undefined],
    ["a bearer token", `Bearer ${"A".repeat(43)}`],
    ["a truncated signature", signed().authorization?.slice(0, -1)],
    ["a non-decimal time", (() => {
      const [publicKey, , signature] = headerParts();
      return `GupInstall ${publicKey}.1e12.${signature}`;
    })()],
  ])("refuses %s", (_name, authorization) => {
    expect(verifier.isAuthentic(signed({ authorization }))).toBe(false);
  });
});
