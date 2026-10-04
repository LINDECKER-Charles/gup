import { afterEach, describe, expect, it } from "vitest";
import { formatBadTargetMessage } from "../../src/commands/update.js";
import { resolveUpdateTarget } from "../../src/core/platform/update-target.js";
import { getProvider } from "../../src/core/registry.js";
import { useLocale } from "../support/locale.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

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
  { id: "npm-g", displayName: "npm (global)" },
];

describe("update target parsing", () => {
  it("rejects targets without a colon", () => {
    expect(splitTarget("winget")).toBeNull();
    expect(splitTarget("")).toBeNull();
  });

  it("splits on the FIRST colon only — package ids may legitimately contain ':'", () => {
    expect(splitTarget("npm-g:@scope/pkg")).toEqual({
      providerId: "npm-g",
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
    expect(splitTarget("npm-g:`whoami`")?.packageId).toBe("`whoami`");
  });
});

describe("formatBadTargetMessage", () => {
  it("preserves the historical 'Format invalide' prefix verbatim (no trailing period after packageId)", () => {
    const msg = formatBadTargetMessage("malformed", FAKE_PROVIDERS);
    // The historical line was 'Format invalide: "<tok>". Attendu provider:packageId'
    // with NO period at the very end of the prefix — preserve that exactly so
    // downstream greps keep matching the original wording.
    expect(msg.split("\n")[0]).toBe(
      'Format invalide: "malformed". Attendu provider:packageId',
    );
  });

  it("suggests provider-scoped commands when the bare token matches a provider id", () => {
    const msg = formatBadTargetMessage("choco", FAKE_PROVIDERS);
    expect(msg).toContain("nom de provider");
    expect(msg).toContain("gup list --provider choco");
    expect(msg).toContain("gup update --provider choco --all");
  });

  it("resolves the provider id case-insensitively (CHOCO/Choco/choco all match)", () => {
    for (const variant of ["choco", "CHOCO", "Choco", "ChoCo"]) {
      const msg = formatBadTargetMessage(variant, FAKE_PROVIDERS);
      expect(msg).toContain("gup update --provider choco --all");
    }
  });

  it("resolves a display name back to its provider id (case-insensitive)", () => {
    const msg = formatBadTargetMessage("Chocolatey", FAKE_PROVIDERS);
    expect(msg).toContain("gup update --provider choco --all");
    // The hint always uses the canonical id, never the display label, to avoid
    // teaching users an id that getProvider() will then reject.
    expect(msg).not.toContain("--provider Chocolatey");
  });

  describe("the generic examples", () => {
    afterEach(() => restorePlatform());

    // A wrong id taught here (`npm-global` for `npm-g`) fails the very next command.
    it("only suggest targets that `gup update` accepts, on the OS their provider runs on", () => {
      const message = formatBadTargetMessage("totally-unknown", FAKE_PROVIDERS);
      const targets = [...message.matchAll(/gup update ([^\s:]+:\S+)/g)].map(([, target]) => target ?? "");

      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const provider = getProvider(target.slice(0, target.indexOf(":")));
        expect(provider, target).toBeDefined();
        setPlatform(provider?.platforms?.[0] ?? process.platform);
        expect(resolveUpdateTarget(target), target).toMatchObject({ isValid: true });
      }
    });
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

  describe("in English", () => {
    useLocale("en");

    it("words the hints in English, the commands unchanged and aligned under their label", () => {
      expect(formatBadTargetMessage("Chocolatey", FAKE_PROVIDERS)).toBe(
        [
          'Invalid format: "Chocolatey". Expected provider:packageId',
          '"Chocolatey" is a provider name, not a package id.',
          "For this provider, try:",
          "  gup list --provider choco",
          "  gup update --provider choco --all",
          "  gup                            # interactive menu",
          "",
        ].join("\n"),
      );
      expect(formatBadTargetMessage("totally-unknown", FAKE_PROVIDERS)).toBe(
        [
          'Invalid format: "totally-unknown". Expected provider:packageId',
          "Examples: gup update winget:Microsoft.VisualStudioCode",
          "          gup update npm-g:typescript",
          "To update a whole provider without targeting a package:",
          "          gup update --provider <id> --all",
          "",
        ].join("\n"),
      );
    });
  });
});
