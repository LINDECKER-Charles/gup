import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider registry: the catalogue, bounded fail-soft detection, the
 * scan filters and the platform gate, `scanAll` (manual rows, errors,
 * callbacks, concurrency, ownership). Providers are the boundary here: the
 * registered ones only ever have their probe stubbed, the scanned ones are
 * fakes. The ownership filter runs for real over a faked PATH lookup.
 */
const lookup = vi.hoisted(() => ({ paths: new Map<string, string>() }));
vi.mock("../../src/core/runner.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  run: async (command: string, args: string[]) => {
    const found = lookup.paths.get(`${command} ${args.join(" ")}`);
    return found === undefined
      ? { stdout: "", stderr: "", exitCode: 1, failed: true }
      : { stdout: found, stderr: "", exitCode: 0, failed: false };
  },
}));

import { installLogBackend, type LogLevel } from "../../src/core/log/log.js";
import { isSupportedOn } from "../../src/core/platform/is-supported-on.js";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import {
  ALL_PROVIDERS,
  detectAvailableProviders,
  getProvider,
  getProvidersToScan,
  scanAll,
} from "../../src/core/registry.js";
import { currentOperation, type OperationContext } from "../../src/core/state/run-context.js";
import type { OutdatedPackage, Provider } from "../../src/core/types.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

interface FakeProviderConfig {
  id: string;
  slow?: boolean;
  platforms?: Provider["platforms"];
  packages?: OutdatedPackage[];
  throwOnList?: unknown;
}

function makeProvider(cfg: FakeProviderConfig): Provider {
  return {
    id: cfg.id,
    displayName: cfg.id,
    ...(cfg.slow === undefined ? {} : { slow: cfg.slow }),
    ...(cfg.platforms === undefined ? {} : { platforms: cfg.platforms }),
    isAvailable: async () => true,
    async listOutdated() {
      if (cfg.throwOnList !== undefined) throw cfg.throwOnList;
      return cfg.packages ?? [];
    },
    update: async (id) => ({ id, success: true }),
    updateAll: async (pkgs) => pkgs.map((p) => ({ id: p.id, success: true })),
  };
}

/**
 * Detection only probes the providers supported on the running platform, and
 * the CI matrix runs this suite on Windows, macOS and Linux: assertions over
 * "every probe" use this list, and single providers are picked by id among
 * the ones declared everywhere.
 */
const SUPPORTED_HERE = ALL_PROVIDERS.filter((p) => isSupportedOn(p));

function registered(id: string): Provider {
  const provider = getProvider(id);
  if (!provider) throw new Error(`no provider registered as ${id}`);
  return provider;
}

/** Every registered probe stubbed to "not installed"; the ones in `available` to "installed". */
function stubDetection(available: readonly string[] = []) {
  const spies = new Map(
    ALL_PROVIDERS.map((p) => [p.id, vi.spyOn(p, "isAvailable").mockResolvedValue(false)]),
  );
  for (const id of available) spies.get(id)!.mockResolvedValue(true);
  return {
    spyOf: (id: string) => spies.get(id)!,
    supportedSpies: () => SUPPORTED_HERE.map((p) => spies.get(p.id)!),
  };
}

beforeEach(() => lookup.paths.clear());

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  restorePlatform();
  installLogBackend(null);
});

describe("registry: the catalogue", () => {
  it("registers every provider under its own id", () => {
    const ids = ALL_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getProvider("winget")?.id).toBe("winget");
    expect(getProvider("does-not-exist")).toBeUndefined();
  });

  it("each provider implements the required Provider contract", () => {
    for (const p of ALL_PROVIDERS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.displayName).toBe("string");
      expect(typeof p.isAvailable).toBe("function");
      expect(typeof p.listOutdated).toBe("function");
      expect(typeof p.update).toBe("function");
      expect(typeof p.updateAll).toBe("function");
    }
  });

  it("lists exactly the providers an unattended run can never update", () => {
    // Each of these always needs UAC or sudo; changing the set is a decision
    // about what a scheduled run may touch, so it takes a test edit. The flag
    // is only ever declared `false`: omitted already means true.
    const adminOnly = ALL_PROVIDERS.filter((p) => p.canUpdateUnattended === false);
    expect(adminOnly.map((p) => p.id)).toEqual([
      "choco",
      "cygwin",
      "npackd",
      "macports",
      "fink",
      "pkgin",
      "visual-studio",
    ]);
    expect(ALL_PROVIDERS.filter((p) => p.canUpdateUnattended === true)).toEqual([]);
  });
});

describe("registry: getProvidersToScan", () => {
  const fast = makeProvider({ id: "fast-one" });
  const slow = makeProvider({ id: "slow-one", slow: true });
  const other = makeProvider({ id: "other" });
  const detected = [fast, slow, other];

  it.each([
    ["no filter keeps the detected list as is", {}, ["fast-one", "slow-one", "other"]],
    ["`only` keeps the ids it names", { only: ["fast-one", "other"] }, ["fast-one", "other"]],
    ["an empty `only` restricts nothing", { only: [] }, ["fast-one", "slow-one", "other"]],
    ["`fast` drops the slow providers", { fast: true }, ["fast-one", "other"]],
    ["`only` and `fast` combine", { only: ["fast-one", "slow-one"], fast: true }, ["fast-one"]],
  ])("%s", async (_label, filters, ids) => {
    const out = await getProvidersToScan({ detected, ...filters });
    expect(out.map((p) => p.id)).toEqual(ids);
  });

  it("detects the providers itself when no detected list is given", async () => {
    const detection = stubDetection();
    expect(await getProvidersToScan({})).toEqual([]);
    for (const spy of detection.supportedSpies()) expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("registry: detectAvailableProviders", () => {
  it("probes every supported provider once and keeps the available ones", async () => {
    const detection = stubDetection(["npm-g", "pip"]);
    expect(await detectAvailableProviders()).toEqual([registered("npm-g"), registered("pip")]);
    for (const spy of detection.supportedSpies()) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when no provider is available", async () => {
    stubDetection();
    expect(await detectAvailableProviders()).toEqual([]);
  });

  it("reads a probe that throws as unavailable instead of failing detection", async () => {
    const detection = stubDetection(["pip"]);
    detection.spyOf("npm-g").mockRejectedValue(new Error("boom"));
    expect(await detectAvailableProviders()).toEqual([registered("pip")]);
  });

  it("gives up on a probe that never settles", async () => {
    vi.useFakeTimers();
    const detection = stubDetection(["pip"]);
    detection.spyOf("npm-g").mockReturnValue(new Promise<boolean>(() => {}));
    const pending = detectAvailableProviders();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual([registered("pip")]);
  });

  it("keeps the number of probes in flight bounded", async () => {
    // Firing every probe at once is what froze the UI on Windows: the probes
    // that spawn a tool turned into one burst of synchronous process creations.
    let inFlight = 0;
    let peak = 0;
    for (const p of ALL_PROVIDERS) {
      vi.spyOn(p, "isAvailable").mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return false;
      });
    }
    await detectAvailableProviders();
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });

  it("runs each probe under a detect operation naming its provider", async () => {
    const seen: Array<OperationContext | undefined> = [];
    const probed = (id: string) =>
      Object.assign(makeProvider({ id }), {
        isAvailable: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          seen.push(currentOperation());
          return true;
        },
      });
    await detectAvailableProviders([probed("a"), probed("b")]);
    expect(seen).toEqual(
      expect.arrayContaining([
        { op: "detect", providerId: "a" },
        { op: "detect", providerId: "b" },
      ]),
    );
  });
});

describe("registry: platform gate", () => {
  const everywhere = makeProvider({ id: "everywhere" });
  const macOnly = makeProvider({ id: "mac-only", platforms: PLATFORMS.macos });
  const posix = makeProvider({ id: "posix", platforms: PLATFORMS.notWindows });

  it("never probes a candidate foreign to the running platform", async () => {
    setPlatform("win32");
    const probes = [everywhere, macOnly, posix].map((p) => vi.spyOn(p, "isAvailable"));
    expect(await detectAvailableProviders([everywhere, macOnly, posix])).toEqual([everywhere]);
    expect(probes.map((probe) => probe.mock.calls.length)).toEqual([1, 0, 0]);
  });

  it("probes only the candidates it is given", async () => {
    setPlatform("darwin");
    const detection = stubDetection();
    expect(await detectAvailableProviders([macOnly, posix])).toEqual([macOnly, posix]);
    for (const spy of detection.supportedSpies()) expect(spy).not.toHaveBeenCalled();
  });

  it("drops an unsupported provider from an injected detected list", async () => {
    setPlatform("linux");
    const out = await getProvidersToScan({ detected: [everywhere, macOnly, posix] });
    expect(out.map((p) => p.id)).toEqual(["everywhere", "posix"]);
  });

  it("never scans an unsupported provider handed to scanAll", async () => {
    setPlatform("win32");
    const listed = vi.spyOn(macOnly, "listOutdated");
    const results = await scanAll({ detected: [everywhere, macOnly] });
    expect(results.map((r) => r.providerId)).toEqual(["everywhere"]);
    expect(listed).not.toHaveBeenCalled();
  });
});

describe("registry: scanAll", () => {
  it("collects every provider's rows, without the ones left to the user", async () => {
    const a = makeProvider({
      id: "a",
      packages: [
        { id: "p1", current: "1.0.0", latest: "1.1.0" },
        { id: "p2", current: "2.0.0", latest: "2.1.0", manual: true },
      ],
    });
    const b = makeProvider({ id: "b", packages: [{ id: "p3", current: "0.1", latest: "0.2" }] });
    const results = await scanAll({ detected: [a, b] });
    expect(results).toEqual([
      { providerId: "a", available: true, packages: [{ id: "p1", current: "1.0.0", latest: "1.1.0" }] },
      { providerId: "b", available: true, packages: [{ id: "p3", current: "0.1", latest: "0.2" }] },
    ]);
  });

  it.each([
    ["an Error", new Error("boom"), "boom"],
    ["anything else, as text", "string-failure", "string-failure"],
  ])("turns a provider that throws %s into an error row, the others unharmed", async (_k, thrown, error) => {
    const broken = makeProvider({ id: "broken", throwOnList: thrown });
    const ok = makeProvider({ id: "ok", packages: [{ id: "x", current: "1", latest: "2" }] });
    const [failed, fine] = await scanAll({ detected: [broken, ok] });
    expect(failed).toEqual({ providerId: "broken", available: true, packages: [], error });
    expect(fine?.error).toBeUndefined();
  });

  it("reports each provider's start before its end, with its own result", async () => {
    const events: Array<["start" | "end", string, boolean?]> = [];
    const a = makeProvider({ id: "a" });
    const b = makeProvider({ id: "b", packages: [{ id: "p", current: "1", latest: "2" }] });
    const c = makeProvider({ id: "c", throwOnList: new Error("nope") });

    await scanAll({
      detected: [a, b, c],
      concurrency: 1,
      onProviderStart: (p) => events.push(["start", p.id]),
      onProviderEnd: (p, r) => {
        expect(r.providerId).toBe(p.id);
        events.push(["end", p.id, r.error === undefined]);
      },
    });

    expect(events).toEqual([
      ["start", "a"],
      ["end", "a", true],
      ["start", "b"],
      ["end", "b", true],
      ["start", "c"],
      ["end", "c", false],
    ]);
  });

  it.each([
    ["`only`", { only: ["b"] }, makeProvider({ id: "a" })],
    ["`fast`", { fast: true }, makeProvider({ id: "a", slow: true })],
  ])("never lists what %s leaves out", async (_label, filters, dropped) => {
    const listed = vi.spyOn(dropped, "listOutdated");
    const results = await scanAll({ detected: [dropped, makeProvider({ id: "b" })], ...filters });
    expect(results.map((r) => r.providerId)).toEqual(["b"]);
    expect(listed).not.toHaveBeenCalled();
  });

  it("enforces the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const providers = Array.from({ length: 6 }, (_, i) =>
      Object.assign(makeProvider({ id: `c${i}` }), {
        listOutdated: async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise<void>((resolve) => release.push(resolve));
          inFlight--;
          return [];
        },
      }),
    );

    const running = scanAll({ detected: providers, concurrency: 2 });
    for (let round = 0; round <= providers.length; round++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      while (release.length) release.shift()!();
    }
    expect(await running).toHaveLength(providers.length);
    expect(peak).toBe(2);
  });

  it("returns an empty array when no providers are detected", async () => {
    expect(await scanAll({ detected: [] })).toEqual([]);
  });

  it("runs each concurrent scan under a scan operation naming its provider", async () => {
    const seen = new Map<string, OperationContext | undefined>();
    const scanned = (id: string, delayMs: number) =>
      Object.assign(makeProvider({ id }), {
        listOutdated: async () => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          seen.set(id, currentOperation());
          return [];
        },
      });
    await scanAll({ detected: [scanned("slow", 5), scanned("quick", 1)], concurrency: 2 });
    expect(seen.get("slow")).toEqual({ op: "scan", providerId: "slow" });
    expect(seen.get("quick")).toEqual({ op: "scan", providerId: "quick" });
    expect(currentOperation()).toBeUndefined();
  });

  it("hides a package whose binary another manager owns, and says why in the debug log", async () => {
    setPlatform("win32");
    lookup.paths.set("where node", "C:\\nvm4w\\nodejs\\node.exe");
    const records: Array<[LogLevel, string, unknown]> = [];
    installLogBackend({
      isEnabled: () => true,
      emit: (level, event, data) => void records.push([level, event, data]),
    });
    const choco = makeProvider({
      id: "choco",
      packages: [
        { id: "nodejs", current: "20.0.0", latest: "22.0.0" },
        { id: "7zip", current: "24.0", latest: "25.0" },
      ],
    });

    const [result] = await scanAll({ detected: [choco] });

    expect(result?.packages.map((p) => p.id)).toEqual(["7zip"]);
    expect(records).toContainEqual([
      "debug",
      "scan.ownership-excluded",
      { providerId: "choco", packageId: "nodejs", binary: "node", owner: "nvm-windows" },
    ]);
  });
});
