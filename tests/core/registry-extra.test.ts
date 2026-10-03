import { afterEach, describe, it, expect, vi } from "vitest";
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
import type {
  OutdatedPackage,
  Provider,
  UpdateOptions,
  UpdateOutcome,
} from "../../src/core/types.js";

interface FakeProviderConfig {
  id: string;
  displayName?: string;
  slow?: boolean;
  platforms?: Provider["platforms"];
  available?: boolean;
  packages?: OutdatedPackage[];
  throwOnList?: unknown;
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

/** Every registered probe mocked to "not installed"; the ones in `available` to "installed". */
function stubDetection(available: readonly string[] = []) {
  const spies = new Map(
    ALL_PROVIDERS.map((p) => [p.id, vi.spyOn(p, "isAvailable").mockResolvedValue(false)]),
  );
  for (const id of available) spies.get(id)!.mockResolvedValue(true);
  return {
    spyOf: (id: string) => spies.get(id)!,
    supportedSpies: () => SUPPORTED_HERE.map((p) => spies.get(p.id)!),
    restore: () => {
      for (const spy of spies.values()) spy.mockRestore();
    },
  };
}

function makeProvider(cfg: FakeProviderConfig): Provider {
  return {
    id: cfg.id,
    displayName: cfg.displayName ?? cfg.id,
    ...(cfg.slow === undefined ? {} : { slow: cfg.slow }),
    ...(cfg.platforms === undefined ? {} : { platforms: cfg.platforms }),
    async isAvailable() {
      return cfg.available ?? true;
    },
    async listOutdated() {
      if (cfg.throwOnList !== undefined) throw cfg.throwOnList;
      return cfg.packages ?? [];
    },
    async update(_id: string, _options?: UpdateOptions): Promise<UpdateOutcome> {
      return { id: _id, success: true };
    },
    async updateAll(pkgs: OutdatedPackage[]): Promise<UpdateOutcome[]> {
      return pkgs.map((p) => ({ id: p.id, success: true }));
    },
  };
}

describe("registry: getProvider", () => {
  it("returns providers for several well-known ids", () => {
    // Hit a handful of distinct catalogue entries beyond the existing "winget"
    // case to exercise the Array#find path on multiple positions.
    for (const id of ["scoop", "choco", "npm-g", "pip", "self"]) {
      expect(getProvider(id)?.id).toBe(id);
    }
  });
});

describe("registry: getProvidersToScan", () => {
  const fast = makeProvider({ id: "fast-one" });
  const slow = makeProvider({ id: "slow-one", slow: true });
  const other = makeProvider({ id: "other" });
  const detected = [fast, slow, other];

  it("returns the injected detected list untouched when no filters apply", async () => {
    const out = await getProvidersToScan({ detected });
    expect(out.map((p) => p.id)).toEqual(["fast-one", "slow-one", "other"]);
  });

  it("filters by `only` ids and drops everything else", async () => {
    const out = await getProvidersToScan({ detected, only: ["fast-one", "other"] });
    expect(out.map((p) => p.id)).toEqual(["fast-one", "other"]);
  });

  it("an empty `only` array means 'no restriction'", async () => {
    const out = await getProvidersToScan({ detected, only: [] });
    expect(out).toHaveLength(detected.length);
  });

  it("drops `slow` providers when `fast` is set", async () => {
    const out = await getProvidersToScan({ detected, fast: true });
    expect(out.map((p) => p.id)).toEqual(["fast-one", "other"]);
  });

  it("combines `only` and `fast` filters", async () => {
    const out = await getProvidersToScan({
      detected,
      only: ["fast-one", "slow-one"],
      fast: true,
    });
    expect(out.map((p) => p.id)).toEqual(["fast-one"]);
  });

  it("falls back to detectAvailableProviders() when `detected` is omitted", async () => {
    // Mark every registered provider as unavailable so we get a deterministic
    // empty result without spawning subprocesses.
    const detection = stubDetection();
    try {
      const out = await getProvidersToScan({});
      expect(out).toEqual([]);
      for (const s of detection.supportedSpies()) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      detection.restore();
    }
  });
});

describe("registry: detectAvailableProviders", () => {
  it("queries every supported provider and returns only the available ones", async () => {
    // Mark exactly two providers as available — verify only those survive.
    const detection = stubDetection(["npm-g", "pip"]);
    try {
      const out = await detectAvailableProviders();
      expect(out).toEqual([registered("npm-g"), registered("pip")]);
      for (const s of detection.supportedSpies()) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      detection.restore();
    }
  });

  it("returns an empty array when no provider is available", async () => {
    const detection = stubDetection();
    try {
      expect(await detectAvailableProviders()).toEqual([]);
    } finally {
      detection.restore();
    }
  });

  it("reads a probe that throws as unavailable instead of failing detection", async () => {
    const detection = stubDetection(["pip"]);
    detection.spyOf("npm-g").mockRejectedValue(new Error("boom"));
    try {
      expect(await detectAvailableProviders()).toEqual([registered("pip")]);
    } finally {
      detection.restore();
    }
  });

  it("gives up on a probe that never settles", async () => {
    vi.useFakeTimers();
    const detection = stubDetection(["pip"]);
    detection.spyOf("npm-g").mockReturnValue(new Promise<boolean>(() => {}));
    try {
      const pending = detectAvailableProviders();
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toEqual([registered("pip")]);
    } finally {
      vi.useRealTimers();
      detection.restore();
    }
  });

  it("keeps the number of probes in flight bounded", async () => {
    // Firing every probe at once is what froze the UI on Windows: the probes
    // that spawn a tool turned into one burst of synchronous process creations.
    let inFlight = 0;
    let peak = 0;
    const spies = ALL_PROVIDERS.map((p) =>
      vi.spyOn(p, "isAvailable").mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return false;
      }),
    );
    try {
      await detectAvailableProviders();
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(8);
    } finally {
      for (const s of spies) s.mockRestore();
    }
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
  const originalPlatform = process.platform;
  const setPlatform = (value: NodeJS.Platform): void => {
    Object.defineProperty(process, "platform", { value, configurable: true });
  };
  afterEach(() => setPlatform(originalPlatform));

  const everywhere = makeProvider({ id: "everywhere" });
  const macOnly = makeProvider({ id: "mac-only", platforms: PLATFORMS.macos });
  const posix = makeProvider({ id: "posix", platforms: PLATFORMS.notWindows });

  it("never probes a candidate foreign to the running platform", async () => {
    setPlatform("win32");
    const probes = [everywhere, macOnly, posix].map((p) => vi.spyOn(p, "isAvailable"));
    const out = await detectAvailableProviders([everywhere, macOnly, posix]);
    expect(out).toEqual([everywhere]);
    expect(probes[0]).toHaveBeenCalledTimes(1);
    expect(probes[1]).not.toHaveBeenCalled();
    expect(probes[2]).not.toHaveBeenCalled();
  });

  it("probes only the candidates it is given", async () => {
    setPlatform("darwin");
    const detection = stubDetection();
    try {
      const out = await detectAvailableProviders([macOnly, posix]);
      expect(out).toEqual([macOnly, posix]);
      for (const spy of detection.supportedSpies()) expect(spy).not.toHaveBeenCalled();
    } finally {
      detection.restore();
    }
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
  it("collects listOutdated results and filters out manual packages", async () => {
    const a = makeProvider({
      id: "a",
      packages: [
        { id: "p1", current: "1.0.0", latest: "1.1.0" },
        { id: "p2", current: "2.0.0", latest: "2.1.0", manual: true },
      ],
    });
    const b = makeProvider({
      id: "b",
      packages: [{ id: "p3", current: "0.1", latest: "0.2" }],
    });
    const results = await scanAll({ detected: [a, b] });
    expect(results).toHaveLength(2);
    const ra = results.find((r) => r.providerId === "a")!;
    const rb = results.find((r) => r.providerId === "b")!;
    expect(ra.available).toBe(true);
    expect(ra.error).toBeUndefined();
    expect(ra.packages.map((p) => p.id)).toEqual(["p1"]);
    expect(rb.packages).toHaveLength(1);
  });

  it("captures Error throws into result.error and keeps the provider available", async () => {
    const broken = makeProvider({
      id: "broken",
      throwOnList: new Error("boom"),
    });
    const ok = makeProvider({
      id: "ok",
      packages: [{ id: "x", current: "1", latest: "2" }],
    });
    const results = await scanAll({ detected: [broken, ok] });
    const rb = results.find((r) => r.providerId === "broken")!;
    expect(rb.error).toBe("boom");
    expect(rb.available).toBe(true);
    expect(rb.packages).toEqual([]);
    expect(results.find((r) => r.providerId === "ok")!.error).toBeUndefined();
  });

  it("stringifies non-Error throws into result.error", async () => {
    const weird = makeProvider({ id: "weird", throwOnList: "string-failure" });
    const [res] = await scanAll({ detected: [weird] });
    expect(res!.error).toBe("string-failure");
  });

  it("invokes onProviderStart before onProviderEnd with consistent arguments", async () => {
    const events: Array<["start" | "end", string, boolean?]> = [];
    const a = makeProvider({ id: "a", packages: [] });
    const b = makeProvider({
      id: "b",
      packages: [{ id: "p", current: "1", latest: "2" }],
    });
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

    // With concurrency=1, ordering is strict: start a, end a, start b, ...
    expect(events).toEqual([
      ["start", "a"],
      ["end", "a", true],
      ["start", "b"],
      ["end", "b", true],
      ["start", "c"],
      ["end", "c", false],
    ]);
  });

  it("respects the `only` filter end-to-end", async () => {
    const a = makeProvider({ id: "a" });
    const b = makeProvider({ id: "b" });
    const aSpy = vi.spyOn(a, "listOutdated");
    const bSpy = vi.spyOn(b, "listOutdated");
    const results = await scanAll({ detected: [a, b], only: ["b"] });
    expect(results.map((r) => r.providerId)).toEqual(["b"]);
    expect(aSpy).not.toHaveBeenCalled();
    expect(bSpy).toHaveBeenCalledTimes(1);
  });

  it("respects the `fast` filter by skipping slow providers", async () => {
    const quick = makeProvider({ id: "quick" });
    const slow = makeProvider({ id: "slow", slow: true });
    const slowSpy = vi.spyOn(slow, "listOutdated");
    const results = await scanAll({ detected: [quick, slow], fast: true });
    expect(results.map((r) => r.providerId)).toEqual(["quick"]);
    expect(slowSpy).not.toHaveBeenCalled();
  });

  it("enforces the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const providers: Provider[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      displayName: `c${i}`,
      isAvailable: async () => true,
      listOutdated: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => release.push(resolve));
        inFlight--;
        return [];
      },
      update: async (id) => ({ id, success: true }),
      updateAll: async () => [],
    }));

    const runP = scanAll({ detected: providers, concurrency: 2 });
    // Drain pending tasks once we have at least 2 in-flight.
    await new Promise<void>((r) => setTimeout(r, 10));
    while (release.length) release.shift()!();
    // Loop until all settled — each batch unblocks the next.
    for (let i = 0; i < providers.length; i++) {
      await new Promise<void>((r) => setTimeout(r, 5));
      while (release.length) release.shift()!();
    }
    const results = await runP;
    expect(results).toHaveLength(providers.length);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  it("returns an empty array when no providers are detected", async () => {
    expect(await scanAll({ detected: [] })).toEqual([]);
  });

  it("uses the default concurrency (4) when none is provided", async () => {
    const a = makeProvider({ id: "default-c-a" });
    const b = makeProvider({ id: "default-c-b" });
    const results = await scanAll({ detected: [a, b] });
    expect(results.map((r) => r.providerId)).toEqual(["default-c-a", "default-c-b"]);
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
});
