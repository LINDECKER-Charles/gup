import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../../../src/core/types.js";

const { registry } = vi.hoisted(() => ({
  registry: {
    ALL_PROVIDERS: [] as Provider[],
    detectAvailableProviders: vi.fn<() => Promise<Provider[]>>(),
  },
}));
vi.mock("../../../src/core/registry.js", () => registry);

import { PLATFORMS } from "../../../src/core/platform/platforms.js";
import { readProviderStatus } from "../../../src/core/platform/provider-status.js";

const originalPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

function fakeProvider(fields: Pick<Provider, "id"> & Partial<Provider>): Provider {
  return {
    displayName: fields.id.toUpperCase(),
    isAvailable: async () => true,
    listOutdated: async () => [],
    update: async (packageId) => ({ id: packageId, success: true }),
    updateAll: async () => [],
    ...fields,
  };
}

const winget = fakeProvider({ id: "winget", platforms: PLATFORMS.windows });
const npm = fakeProvider({ id: "npm-g" });
const pip = fakeProvider({ id: "pip", installHint: "python -m ensurepip" });
const brewCask = fakeProvider({ id: "brew-cask", platforms: PLATFORMS.macos });

beforeEach(() => {
  registry.ALL_PROVIDERS = [winget, npm, pip, brewCask];
  registry.detectAvailableProviders.mockResolvedValue([npm]);
});

afterEach(() => setPlatform(originalPlatform));

describe("readProviderStatus", () => {
  it("sorts providers into detected, missing and incompatible, in registry order", async () => {
    setPlatform("darwin");
    const report = await readProviderStatus();
    expect(report.platform).toBe("darwin");
    expect(report.detected.map((p) => p.id)).toEqual(["npm-g"]);
    expect(report.missing.map((p) => p.id)).toEqual(["pip", "brew-cask"]);
    expect(report.incompatible.map((p) => p.id)).toEqual(["winget"]);
  });

  it("classifies against the running platform", async () => {
    setPlatform("win32");
    const report = await readProviderStatus();
    expect(report.platform).toBe("win32");
    expect(report.missing.map((p) => p.id)).toEqual(["winget", "pip"]);
    expect(report.incompatible.map((p) => p.id)).toEqual(["brew-cask"]);
  });

  it("carries the install hint and the platform set only when the provider has them", async () => {
    setPlatform("darwin");
    const report = await readProviderStatus();
    expect(report.detected[0]).toEqual({ id: "npm-g", displayName: "NPM-G" });
    expect(report.missing[0]).toEqual({
      id: "pip",
      displayName: "PIP",
      installHint: "python -m ensurepip",
    });
    expect(report.incompatible[0]).toEqual({
      id: "winget",
      displayName: "WINGET",
      platforms: PLATFORMS.windows,
    });
  });

  it("produces plain data a report can serialise", async () => {
    const report = await readProviderStatus();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
