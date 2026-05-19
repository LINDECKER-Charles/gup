import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runPmUpdateMock, describeSourceMock } = vi.hoisted(() => ({
  runPmUpdateMock: vi.fn(),
  describeSourceMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  runPmUpdate: runPmUpdateMock,
  describeSource: describeSourceMock,
}));

const { existsSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

const { readFileMock, readdirMock, statMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    readFile: readFileMock,
    readdir: readdirMock,
    stat: statMock,
  };
});

import { JetBrainsProvider } from "../../src/providers/ide/jetbrains.js";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  runPmUpdateMock.mockReset();
  describeSourceMock.mockReset();
  describeSourceMock.mockImplementation((s: string) =>
    s === "manual" ? "manuel" : `via ${s}`,
  );
  existsSyncMock.mockReset();
  readFileMock.mockReset();
  readdirMock.mockReset();
  statMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env["LOCALAPPDATA"] = "C:\\Users\\me\\AppData\\Local";
  process.env["USERPROFILE"] = "C:\\Users\\me";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

function dir(): { isDirectory: () => boolean } {
  return { isDirectory: () => true };
}

function file(): { isDirectory: () => boolean } {
  return { isDirectory: () => false };
}

describe("JetBrainsProvider.isAvailable", () => {
  it("returns false when no candidate root exists", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(false);
  });

  it("returns true when at least one candidate root exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.includes("Toolbox\\apps"),
    );
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(true);
  });
});

describe("JetBrainsProvider.listOutdated", () => {
  it("returns [] when scan finds nothing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits a toolbox-managed outdated entry with manual=true", async () => {
    // Only the toolbox root exists, and only the product-info.json under it.
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      return lower.includes("\\jetbrains\\toolbox\\apps");
    });
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      if (path.toLowerCase().endsWith("webstorm")) return [];
      return [];
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.1.0",
          buildNumber: "241.10000.0",
          productCode: "WS",
        });
      }
      throw new Error("ENOENT");
    });
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.0.0", version: "2024.2.0", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toEqual([
      {
        id: "WS",
        name: "WebStorm",
        current: "2024.1.0",
        latest: "2024.2.0",
        note: "via Toolbox",
        manual: true,
      },
    ]);
  });

  it("emits a scoop-sourced entry without manual flag", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\scoop\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("scoop\\apps")) return ["webstorm"];
      if (path.toLowerCase().endsWith("webstorm")) return [];
      return [];
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.1.0",
          buildNumber: "241.0.0",
          productCode: "WS",
        });
      }
      throw new Error("ENOENT");
    });
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.0.0", version: "2024.2.0", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toEqual([
      {
        id: "WS",
        name: "WebStorm",
        current: "2024.1.0",
        latest: "2024.2.0",
        note: "via scoop",
      },
    ]);
    expect(describeSourceMock).toHaveBeenCalledWith("scoop");
  });

  it("filters when latest build is not newer", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.2.0",
        buildNumber: "242.10000.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.0.0", version: "2024.2.0", type: "release" }],
      }),
    );

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("filters when fetchJetBrainsLatest returns null (HTTP not ok)", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("filters when fetch throws", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when fetch json yields empty array for productCode", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(jsonResponse({ WS: [] }));

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("walks subdirectories to find product-info.json", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("toolbox\\apps")) return ["IDEA-U"];
      if (lower.endsWith("idea-u")) return ["ch-0"];
      if (lower.endsWith("ch-0")) return ["242.0"];
      if (lower.endsWith("242.0")) return [];
      return [];
    });
    let productInfoCalls = 0;
    readFileMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("product-info.json")) {
        productInfoCalls += 1;
        // Only the leaf has product-info.json
        if (lower.includes("242.0\\product-info.json")) {
          return JSON.stringify({
            name: "IntelliJ IDEA Ultimate",
            version: "2024.2.0",
            buildNumber: "242.0.0",
            productCode: "IU",
          });
        }
      }
      throw new Error("ENOENT");
    });
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        IU: [{ build: "242.10.0", version: "2024.2.1", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "IU",
      name: "IntelliJ IDEA Ultimate",
      current: "2024.2.0",
      latest: "2024.2.1",
      note: "via Toolbox",
      manual: true,
    });
    expect(productInfoCalls).toBeGreaterThan(0);
  });

  it("skips a candidate root when readdir at the root fails", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async () => {
      throw new Error("EACCES");
    });
    statMock.mockResolvedValue(dir());

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("ignores malformed product-info.json (parse error)", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce("{not valid json");
    statMock.mockResolvedValue(dir());

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("ignores product-info.json missing required fields", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ name: "WebStorm" /* no version etc. */ }),
    );
    statMock.mockResolvedValue(dir());

    await expect(new JetBrainsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips non-directory children when walking", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("toolbox\\apps")) return ["WebStorm"];
      if (lower.endsWith("webstorm")) return ["bin.txt", "subdir"];
      if (lower.endsWith("subdir")) return [];
      return [];
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("webstorm\\product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.1.0",
          buildNumber: "241.0.0",
          productCode: "WS",
        });
      }
      throw new Error("ENOENT");
    });
    statMock.mockImplementation(async (p: string) => {
      if (p.toLowerCase().endsWith("bin.txt")) return file();
      return dir();
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.0.0", version: "2024.2.0", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toHaveLength(1);
  });

  it("tolerates stat() rejecting on a child entry", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("toolbox\\apps")) return ["WebStorm"];
      if (lower.endsWith("webstorm")) return ["bad"];
      return [];
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("webstorm\\product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.1.0",
          buildNumber: "241.0.0",
          productCode: "WS",
        });
      }
      throw new Error("ENOENT");
    });
    statMock.mockImplementation(async (p: string) => {
      if (p.toLowerCase().endsWith("bad")) throw new Error("EACCES");
      return dir();
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.0.0", version: "2024.2.0", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toHaveLength(1);
  });

  it("dedupes by productCode keeping the newest build across roots", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      return (
        lower.includes("\\jetbrains\\toolbox\\apps") ||
        lower.includes("\\appdata\\local\\programs")
      );
    });
    readdirMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("toolbox\\apps")) return ["WebStorm-old"];
      if (lower.endsWith("\\programs")) return ["WebStorm-new"];
      if (lower.endsWith("webstorm-old") || lower.endsWith("webstorm-new"))
        return [];
      return [];
    });
    readFileMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("webstorm-old\\product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.1.0",
          buildNumber: "241.0.0",
          productCode: "WS",
        });
      }
      if (lower.endsWith("webstorm-new\\product-info.json")) {
        return JSON.stringify({
          name: "WebStorm",
          version: "2024.2.0",
          buildNumber: "242.0.0",
          productCode: "WS",
        });
      }
      throw new Error("ENOENT");
    });
    statMock.mockResolvedValue(dir());
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        WS: [{ build: "242.10.0", version: "2024.2.1", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    // Only one entry; current must be the newest installed build (2024.2.0,
    // detected from the Programs root → winget source).
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "WS",
      current: "2024.2.0",
      latest: "2024.2.1",
      note: "via winget",
    });
    expect(out[0]).not.toHaveProperty("manual");
  });
});

describe("JetBrainsProvider.update", () => {
  it("returns failure when the IDE is no longer installed", async () => {
    existsSyncMock.mockReturnValue(false);
    const res = await new JetBrainsProvider().update("WS");
    expect(res.success).toBe(false);
    expect(res.id).toBe("WS");
    expect(res.message).toContain("introuvable");
  });

  it("returns skipped for Toolbox-managed IDEs", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("toolbox\\apps")) return ["WebStorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());

    const res = await new JetBrainsProvider().update("WS");
    expect(res).toMatchObject({
      id: "WS",
      success: false,
      skipped: true,
    });
    expect(res.message).toContain("Toolbox");
  });

  it("delegates to runPmUpdate for scoop installs", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\scoop\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("scoop\\apps")) return ["webstorm"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    runPmUpdateMock.mockResolvedValueOnce({ id: "WS", success: true });

    const res = await new JetBrainsProvider().update("WS");
    expect(res).toEqual({ id: "WS", success: true });
    expect(runPmUpdateMock).toHaveBeenCalledWith(
      "WS",
      "scoop",
      expect.objectContaining({ scoop: "webstorm" }),
      expect.stringContaining("Pas de mapping scoop"),
    );
  });

  it("delegates to runPmUpdate for winget installs (mapped product)", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\appdata\\local\\programs"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("\\programs")) return ["WebStorm 2024.1"];
      if (path.toLowerCase().endsWith("webstorm 2024.1")) return [];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());
    runPmUpdateMock.mockResolvedValueOnce({ id: "WS", success: true });

    const res = await new JetBrainsProvider().update("WS");
    expect(res).toEqual({ id: "WS", success: true });
    expect(runPmUpdateMock).toHaveBeenCalledWith(
      "WS",
      "winget",
      expect.objectContaining({ winget: "JetBrains.WebStorm" }),
      expect.any(String),
    );
  });

  it("returns the manual download URL for manual installs", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p === "C:\\Program Files\\JetBrains",
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path === "C:\\Program Files\\JetBrains") return ["WebStorm 2024.1"];
      if (path.endsWith("WebStorm 2024.1")) return [];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "WebStorm",
        version: "2024.1.0",
        buildNumber: "241.0.0",
        productCode: "WS",
      }),
    );
    statMock.mockResolvedValue(dir());

    const res = await new JetBrainsProvider().update("WS");
    expect(res.success).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.message).toContain("webstorm/download");
  });

  it("falls back to products/download for an unmapped productCode", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p === "C:\\Program Files\\JetBrains",
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path === "C:\\Program Files\\JetBrains") return ["Mystery"];
      if (path.endsWith("Mystery")) return [];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "Mystery",
        version: "1.0.0",
        buildNumber: "100.0.0",
        productCode: "XX",
      }),
    );
    statMock.mockResolvedValue(dir());

    const res = await new JetBrainsProvider().update("XX");
    expect(res.message).toContain("products/download");
  });
});

describe("JetBrainsProvider.candidateRoots edge cases", () => {
  it("ignores LOCALAPPDATA and USERPROFILE when unset", async () => {
    delete process.env["LOCALAPPDATA"];
    delete process.env["USERPROFILE"];
    existsSyncMock.mockReturnValue(false);
    await expect(new JetBrainsProvider().isAvailable()).resolves.toBe(false);
  });

  it("returns skipped manual outcome for an unmapped scoop productCode", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\scoop\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("scoop\\apps")) return ["custom"];
      return [];
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "Custom",
        version: "1.0.0",
        buildNumber: "100.0.0",
        productCode: "XX",
      }),
    );
    statMock.mockResolvedValue(dir());
    runPmUpdateMock.mockResolvedValueOnce({
      id: "XX",
      success: false,
      skipped: true,
      message: "fallback",
    });

    const res = await new JetBrainsProvider().update("XX");
    expect(res.skipped).toBe(true);
    expect(runPmUpdateMock).toHaveBeenCalledWith(
      "XX",
      "scoop",
      {},
      expect.any(String),
    );
  });

  it("findLatestProductInfo picks the deeper newer build when multiple match within a tree", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.toLowerCase().includes("\\jetbrains\\toolbox\\apps"),
    );
    readdirMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.endsWith("toolbox\\apps")) return ["IDEA-U"];
      if (lower.endsWith("idea-u")) return ["ch-0", "ch-1"];
      if (lower.endsWith("ch-0") || lower.endsWith("ch-1")) return [];
      return [];
    });
    statMock.mockResolvedValue(dir());
    readFileMock.mockImplementation(async (path: string) => {
      const lower = path.toLowerCase();
      if (lower.includes("idea-u\\product-info.json")) {
        // Older build at the root of the product dir.
        return JSON.stringify({
          name: "IDEA",
          version: "2024.1",
          buildNumber: "241.0.0",
          productCode: "IU",
        });
      }
      if (lower.includes("ch-0\\product-info.json")) {
        return JSON.stringify({
          name: "IDEA",
          version: "2024.2",
          buildNumber: "242.0.0",
          productCode: "IU",
        });
      }
      if (lower.includes("ch-1\\product-info.json")) {
        return JSON.stringify({
          name: "IDEA",
          version: "2024.3",
          buildNumber: "243.0.0",
          productCode: "IU",
        });
      }
      throw new Error("ENOENT");
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        IU: [{ build: "244.0.0", version: "2024.4", type: "release" }],
      }),
    );

    const out = await new JetBrainsProvider().listOutdated();
    expect(out).toHaveLength(1);
    // The newest build inside the tree (ch-1) wins.
    expect(out[0]?.current).toBe("2024.3");
  });
});

describe("JetBrainsProvider.updateAll", () => {
  it("returns [] when given no packages", async () => {
    await expect(new JetBrainsProvider().updateAll([])).resolves.toEqual([]);
  });

  it("invokes update() for each package and aggregates outcomes", async () => {
    existsSyncMock.mockReturnValue(false); // forces update() not-found path
    const outcomes = await new JetBrainsProvider().updateAll([
      { id: "WS", current: "1", latest: "2" } as never,
      { id: "IU", current: "1", latest: "2" } as never,
    ]);
    expect(outcomes).toHaveLength(2);
    for (const o of outcomes) expect(o.success).toBe(false);
    expect(outcomes[0]?.id).toBe("WS");
    expect(outcomes[1]?.id).toBe("IU");
  });
});
