import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../../src/core/types.js";

const { getProviderMock } = vi.hoisted(() => ({ getProviderMock: vi.fn() }));
vi.mock("../../../src/core/registry.js", () => ({ getProvider: getProviderMock }));

import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import { resolveUpdateTarget } from "../../../src/core/platform/update-target.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * The one check `gup update <cibles…>` and the elevated `__admin-batch` child
 * both apply before a package manager receives a package id.
 */

function fakeProvider(id: string, platforms?: Provider["platforms"]): Provider {
  return {
    id,
    displayName: id,
    ...(platforms && { platforms }),
    isAvailable: async () => true,
    listOutdated: async () => [],
    update: async (packageId) => ({ id: packageId, success: true }),
    updateAll: async () => [],
  };
}

const NPM = fakeProvider("npm-g");
const PROVIDERS = new Map([
  ["npm-g", NPM],
  ["choco", fakeProvider("choco", PLATFORMS.windows)],
]);

beforeEach(() => {
  getProviderMock.mockImplementation((id: string) => PROVIDERS.get(id));
});

afterEach(() => restorePlatform());

describe("resolveUpdateTarget", () => {
  it("resolves the provider before the first colon; the package id keeps the rest", () => {
    expect(resolveUpdateTarget("npm-g:@scope/pkg")).toEqual({
      isValid: true,
      provider: NPM,
      packageId: "@scope/pkg",
    });
    expect(resolveUpdateTarget("npm-g:a:b")).toMatchObject({ isValid: true, packageId: "a:b" });
  });

  it.each([
    ["no separator", "typescript", "typescript"],
    ["no provider", ":typescript", "typescript"],
  ])("refuses a target with %s as a format problem", (_case, target, packageId) => {
    expect(resolveUpdateTarget(target)).toEqual({
      isValid: false,
      problem: "format",
      packageId,
      error: `Format invalide: "${target}". Attendu provider:packageId`,
    });
  });

  it.each([
    ["an option", "npm-g:--registry=http://attacker.invalid", "ne commence pas par « - »"],
    ["a short option", "npm-g:-g", "ne commence pas par « - »"],
    ["an option behind blanks", "npm-g:  -y", "ne commence pas par « - »"],
    ["no package id", "npm-g:", "identifiant de paquet manquant"],
    ["a blank package id", "npm-g:   ", "identifiant de paquet manquant"],
  ])("refuses %s as the package id", (_case, target, reason) => {
    const resolved = resolveUpdateTarget(target);

    expect(resolved).toMatchObject({ isValid: false, problem: "package" });
    expect(resolved.isValid ? "" : resolved.error).toContain(reason);
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it.each(["npm-g:pkg\u0007", "npm-g:pkg\u001b[2J", "npm-g\u0000:pkg", "npm-g:pkg\u007f", "no\nseparator"])(
    "refuses a control character anywhere, without echoing it (%j)",
    (target) => {
      const resolved = resolveUpdateTarget(target);

      expect(resolved).toMatchObject({ isValid: false, problem: "package" });
      expect(resolved.isValid ? "" : resolved.error).not.toMatch(/[\u0000-\u001f\u007f]/);
    },
  );

  it("refuses an unknown provider, and one this OS does not run, as the lookup words it", () => {
    setPlatform("darwin");

    expect(resolveUpdateTarget("nope:x")).toEqual({
      isValid: false,
      problem: "provider",
      packageId: "x",
      error: "Provider inconnu: nope",
    });
    expect(resolveUpdateTarget("choco:git")).toMatchObject({
      isValid: false,
      problem: "provider",
      error: expect.stringContaining("indisponible sur macOS"),
    });
  });
});
