import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { runMock, runInheritMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  run: runMock,
  runInherit: runInheritMock,
}));

import {
  scanVsCodeLikeExtensions,
  updateVsCodeLikeExtension,
  fetchMicrosoftMarketplaceLatest,
  fetchOpenVsxLatest,
} from "../../src/providers/ide/vscode-like.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  runMock.mockReset();
  runInheritMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scanVsCodeLikeExtensions", () => {
  it("returns [] when run reports failed", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    const fetchLatest = vi.fn();
    const out = await scanVsCodeLikeExtensions({ binary: "code", fetchLatest });
    expect(out).toEqual([]);
    expect(fetchLatest).not.toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledWith("code", [
      "--list-extensions",
      "--show-versions",
    ]);
  });

  it("returns [] when stdout has no @-bearing lines", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage\nno-at-sign-here\n"));
    const fetchLatest = vi.fn();
    const out = await scanVsCodeLikeExtensions({ binary: "code", fetchLatest });
    expect(out).toEqual([]);
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("parses publisher.name@version lines and emits the diff", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("ms-python.python@2024.1.0\nesbenp.prettier-vscode@10.0.0\n"),
    );
    const fetchLatest = vi
      .fn()
      .mockResolvedValueOnce("2024.2.0")
      .mockResolvedValueOnce("10.1.0");
    const out = await scanVsCodeLikeExtensions({ binary: "code", fetchLatest });
    expect(out).toEqual([
      {
        id: "ms-python.python",
        name: "ms-python.python",
        current: "2024.1.0",
        latest: "2024.2.0",
      },
      {
        id: "esbenp.prettier-vscode",
        name: "esbenp.prettier-vscode",
        current: "10.0.0",
        latest: "10.1.0",
      },
    ]);
  });

  it("uses lastIndexOf('@') so @-containing publishers still parse", async () => {
    runMock.mockResolvedValueOnce(mkRun("weird@publisher.ext@1.0.0\n"));
    const fetchLatest = vi.fn().mockResolvedValue("1.1.0");
    const out = await scanVsCodeLikeExtensions({ binary: "code", fetchLatest });
    expect(fetchLatest).toHaveBeenCalledWith("weird@publisher.ext");
    expect(out[0]).toMatchObject({
      id: "weird@publisher.ext",
      current: "1.0.0",
      latest: "1.1.0",
    });
  });

  it("skips when current equals latest and when fetchLatest returns null", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("a.same@1.0.0\nb.null@2.0.0\nc.upd@3.0.0\n"),
    );
    const fetchLatest = vi
      .fn()
      .mockImplementation(async (id: string) => {
        if (id === "a.same") return "1.0.0";
        if (id === "b.null") return null;
        if (id === "c.upd") return "3.1.0";
        return null;
      });
    const out = await scanVsCodeLikeExtensions({ binary: "code", fetchLatest });
    expect(out).toEqual([
      { id: "c.upd", name: "c.upd", current: "3.0.0", latest: "3.1.0" },
    ]);
  });

  it("honors custom concurrency option", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("p.a@1.0.0\r\np.b@1.0.0\r\np.c@1.0.0"),
    );
    const fetchLatest = vi.fn().mockResolvedValue("1.1.0");
    const out = await scanVsCodeLikeExtensions({
      binary: "code",
      fetchLatest,
      concurrency: 1,
    });
    expect(out).toHaveLength(3);
    expect(fetchLatest).toHaveBeenCalledTimes(3);
  });
});

describe("updateVsCodeLikeExtension", () => {
  it("returns success when runInherit succeeds", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const out = await updateVsCodeLikeExtension("code", "ms-python.python");
    expect(out).toEqual({ id: "ms-python.python", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("code", [
      "--install-extension",
      "ms-python.python",
      "--force",
    ]);
  });

  it("propagates failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const out = await updateVsCodeLikeExtension("cursor", "foo.bar");
    expect(out).toEqual({ id: "foo.bar", success: false });
  });
});

describe("fetchMicrosoftMarketplaceLatest", () => {
  function stubFetch(impl: (url: string, init: RequestInit) => Promise<unknown>) {
    const fn = vi.fn(impl as never);
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("returns the version on the happy path and POSTs the right body+URL", async () => {
    const fn = stubFetch(async () => ({
      ok: true,
      json: async () => ({
        results: [{ extensions: [{ versions: [{ version: "2024.5.0" }] }] }],
      }),
    }));
    const v = await fetchMicrosoftMarketplaceLatest("ms-python.python");
    expect(v).toBe("2024.5.0");
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe(
      "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    );
    expect((init as RequestInit).method).toBe("POST");
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.filters[0].criteria).toEqual(
      expect.arrayContaining([
        { filterType: 7, value: "ms-python.python" },
      ]),
    );
  });

  it("returns null when results is missing", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({}) }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null when results is empty", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ results: [] }) }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null when extensions is missing/empty", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ results: [{ extensions: [] }] }),
    }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null when versions is empty", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ results: [{ extensions: [{ versions: [] }] }] }),
    }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null when version field is absent", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({
        results: [{ extensions: [{ versions: [{}] }] }],
      }),
    }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null when response is not ok", async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });

  it("returns null on network error", async () => {
    stubFetch(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });
});

describe("fetchOpenVsxLatest", () => {
  function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
    const fn = vi.fn(impl as never);
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("returns null when extensionId has no '.' separator", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    await expect(fetchOpenVsxLatest("noseparator")).resolves.toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns version on happy path and URL-encodes both segments", async () => {
    const fn = stubFetch(async () => ({
      ok: true,
      json: async () => ({ version: "1.2.3" }),
    }));
    const v = await fetchOpenVsxLatest("my-publisher.my+name");
    expect(v).toBe("1.2.3");
    const [url] = fn.mock.calls[0]!;
    expect(url).toBe(
      `https://open-vsx.org/api/${encodeURIComponent("my-publisher")}/${encodeURIComponent("my+name")}`,
    );
    expect(url).toContain("my%2Bname");
  });

  it("returns null when version field is absent", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({}) }));
    await expect(fetchOpenVsxLatest("foo.bar")).resolves.toBeNull();
  });

  it("returns null when response is not ok", async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    await expect(fetchOpenVsxLatest("foo.bar")).resolves.toBeNull();
  });

  it("returns null on network error", async () => {
    stubFetch(async () => {
      throw new Error("timeout");
    });
    await expect(fetchOpenVsxLatest("foo.bar")).resolves.toBeNull();
  });
});
