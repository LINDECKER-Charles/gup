import { describe, expect, it } from "vitest";
import {
  parseTarget,
  TARGET_MESSAGES,
  targetKey,
} from "../../../src/core/scheduler/model/schedule-target.js";
import { useLocale } from "../../support/locale.js";

describe("parseTarget", () => {
  it("reads provider:packageId, splitting on the first colon", () => {
    expect(parseTarget("winget:Git.Git")).toEqual({
      ok: true,
      target: { providerId: "winget", packageId: "Git.Git" },
    });
    expect(parseTarget(" docker:ghcr.io/x:latest ")).toEqual({
      ok: true,
      target: { providerId: "docker", packageId: "ghcr.io/x:latest" },
    });
  });

  it("refuses a bare provider: a schedule never names a whole provider", () => {
    expect(parseTarget("winget")).toEqual({ ok: false, reason: TARGET_MESSAGES.neverAProvider });
  });

  it.each([
    ["winget:", "identifiant de paquet manquant"],
    ["winget:   ", "identifiant de paquet manquant"],
    ["npm-g:*", "jokers"],
    ["npm-g:type?cript", "jokers"],
    ["npm-g:--force", "ne commence pas par « - »"],
    ["npm-g:a\nb", "caractère de contrôle"],
    [`npm-g:${"x".repeat(257)}`, "trop long"],
    [":Git.Git", "identifiant de provider invalide"],
    ["win get:Git.Git", "identifiant de provider invalide"],
  ])("refuses %j", (text, reason) => {
    const parsed = parseTarget(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(reason);
  });

  it("keys a target the way the update pipeline keys a package", () => {
    expect(targetKey({ providerId: "winget", packageId: "Git.Git" })).toBe("winget:Git.Git");
  });
});

describe("parseTarget in English", () => {
  useLocale("en");

  it.each([
    [":Git.Git", '":Git.Git": invalid provider id'],
    ["npm-g:*", '"npm-g:*": wildcards (* ?) are refused — a schedule targets specific packages'],
    [`npm-g:${"x".repeat(257)}`, "id too long (256 characters at most)"],
  ])("says why %j is not a target", (text, reason) => {
    const parsed = parseTarget(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(reason);
  });
});
