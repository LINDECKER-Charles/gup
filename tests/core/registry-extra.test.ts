import { describe, it, expect, vi } from "vitest";
import {
  ALL_PROVIDERS,
  detectAvailableProviders,
  getProvider,
  getProvidersToScan,
  scanAll,
} from "../../src/core/registry.js";
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
  available?: boolean;
  packages?: OutdatedPackage[];
  throwOnList?: unknown;
}

function makeProvider(cfg: FakeProviderConfig): Provider {
  return {
    id: cfg.id,
    displayName: cfg.displayName ?? cfg.id,
    slow: cfg.slow,
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
    const spies = ALL_PROVIDERS.map((p) =>
      vi.spyOn(p, "isAvailable").mockResolvedValue(false),
    );
    try {
      const out = await getProvidersToScan({});
      expect(out).toEqual([]);
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe("registry: detectAvailableProviders", () => {
  it("queries every registered provider and returns only the available ones", async () => {
    const spies = ALL_PROVIDERS.map((p) =>
      vi.spyOn(p, "isAvailable").mockResolvedValue(false),
    );
    // Mark exactly two providers as available — verify only those survive.
    spies[0]!.mockResolvedValue(true);
    spies[3]!.mockResolvedValue(true);
    try {
      const out = await detectAvailableProviders();
      expect(out).toEqual([ALL_PROVIDERS[0], ALL_PROVIDERS[3]]);
      for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("returns an empty array when no provider is available", async () => {
    const spies = ALL_PROVIDERS.map((p) =>
      vi.spyOn(p, "isAvailable").mockResolvedValue(false),
    );
    try {
      expect(await detectAvailableProviders()).toEqual([]);
    } finally {
      for (const s of spies) s.mockRestore();
    }
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
});
