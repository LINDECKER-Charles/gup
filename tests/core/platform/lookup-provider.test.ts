import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../../src/core/types.js";

const { getProviderMock } = vi.hoisted(() => ({ getProviderMock: vi.fn() }));
vi.mock("../../../src/core/registry.js", () => ({ getProvider: getProviderMock }));

import { lookupProvider } from "../../../src/core/platform/lookup-provider.js";
import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

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

const PROVIDERS = new Map([
  ["npm-g", fakeProvider("npm-g")],
  ["brew-cask", fakeProvider("brew-cask", PLATFORMS.macos)],
]);

beforeEach(() => {
  getProviderMock.mockImplementation((id: string) => PROVIDERS.get(id));
});

afterEach(() => restorePlatform());

describe("lookupProvider", () => {
  it("refuses an id no provider is registered under", () => {
    expect(lookupProvider("nope")).toEqual({ isFound: false, error: "Provider inconnu: nope" });
  });

  it("resolves an unrestricted provider on any platform", () => {
    setPlatform("win32");
    expect(lookupProvider("npm-g")).toEqual({ isFound: true, provider: PROVIDERS.get("npm-g") });
  });

  it("resolves a restricted provider on a platform it supports", () => {
    setPlatform("darwin");
    expect(lookupProvider("brew-cask")).toMatchObject({ isFound: true });
  });

  it("refuses a provider foreign to the running platform, naming where it runs", () => {
    setPlatform("win32");
    expect(lookupProvider("brew-cask")).toEqual({
      isFound: false,
      error: "Provider brew-cask indisponible sur Windows (macOS uniquement)",
    });
  });
});
