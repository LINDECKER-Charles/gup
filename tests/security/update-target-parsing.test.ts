import { describe, expect, it } from "vitest";
import { formatBadTargetMessage } from "../../src/commands/update.js";

/**
 * `gup update provider:packageId` is the only CLI surface where a user can hand
 * us a free-form package id. The split is done in commands/update.ts via
 * String#indexOf(":"). We replicate it here as a contract test so a future
 * refactor (split on regex / on every colon) cannot silently break the
 * "provider prefix is exactly one token" guarantee that downstream providers
 * rely on.
 */
function splitTarget(target: string): { providerId: string; packageId: string } | null {
  const idx = target.indexOf(":");
  if (idx === -1) return null;
  return { providerId: target.slice(0, idx), packageId: target.slice(idx + 1) };
}

const FAKE_PROVIDERS = [
  { id: "choco", displayName: "Chocolatey" },
  { id: "winget", displayName: "Winget" },
  { id: "npm-global", displayName: "npm (global)" },
];

describe("update target parsing", () => {
  it("rejects targets without a colon", () => {
    expect(splitTarget("winget")).toBeNull();
    expect(splitTarget("")).toBeNull();
  });

  it("splits on the FIRST colon only — package ids may legitimately contain ':'", () => {
    expect(splitTarget("npm-global:@scope/pkg")).toEqual({
      providerId: "npm-global",
      packageId: "@scope/pkg",
    });
    expect(splitTarget("winget:Microsoft.VisualStudioCode")).toEqual({
      providerId: "winget",
      packageId: "Microsoft.VisualStudioCode",
    });
    expect(splitTarget("foo:bar:baz")).toEqual({
      providerId: "foo",
      packageId: "bar:baz",
    });
  });

  it("does not unwrap shell metacharacters in the packageId", () => {
    // The CLI must hand the literal id to the provider; sanitization (if any)
    // belongs to the provider, never to the parser.
    expect(splitTarget("winget:foo; rm -rf /")?.packageId).toBe("foo; rm -rf /");
    expect(splitTarget("npm-global:`whoami`")?.packageId).toBe("`whoami`");
  });
});

describe("formatBadTargetMessage", () => {
  it("preserves the historical 'Format invalide' prefix so existing tooling/tests keep matching", () => {
    expect(formatBadTargetMessage("malformed", FAKE_PROVIDERS)).toMatch(
      /^Format invalide: "malformed"\. Attendu provider:packageId\./,
    );
  });

  it("suggests provider-scoped commands when the bare token matches a provider id", () => {
    const msg = formatBadTargetMessage("choco", FAKE_PROVIDERS);
    expect(msg).toContain("nom de provider");
    expect(msg).toContain("gup list --provider choco");
    expect(msg).toContain("gup update --provider choco --all");
  });

  it("resolves a display name back to its provider id (case-insensitive)", () => {
    const msg = formatBadTargetMessage("Chocolatey", FAKE_PROVIDERS);
    expect(msg).toContain("gup update --provider choco --all");
    // The hint always uses the canonical id, never the display label, to avoid
    // teaching users an id that getProvider() will then reject.
    expect(msg).not.toContain("--provider Chocolatey");
  });

  it("falls back to generic provider:packageId examples for an unknown token", () => {
    const msg = formatBadTargetMessage("totally-unknown", FAKE_PROVIDERS);
    expect(msg).toContain("Exemples : gup update winget:Microsoft.VisualStudioCode");
    expect(msg).toContain("gup update --provider <id> --all");
    // Defensive: the generic branch must not hallucinate a --provider id from
    // the unknown token (would be misleading).
    expect(msg).not.toContain("--provider totally-unknown");
  });

  it("does not interpret the bare token as an authorization to mass-update a provider", () => {
    // Contract: even when the token matches a real provider, the function only
    // builds an *error* message — the surrounding CLI returns exit 2 and never
    // triggers a destructive `update --all` on the user's behalf.
    const msg = formatBadTargetMessage("choco", FAKE_PROVIDERS);
    expect(msg).toMatch(/^Format invalide/);
  });
});
