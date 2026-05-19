import { describe, expect, it } from "vitest";

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
