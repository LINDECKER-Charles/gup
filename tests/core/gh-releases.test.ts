import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubReleaseLatest,
  fetchGitHubReleaseTagMatching,
  normalizeVersion,
} from "../../src/core/gh-releases.js";

type FetchFn = typeof fetch;

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("normalizeVersion", () => {
  it("strips leading v (lower & upper) and lowercases", () => {
    expect(normalizeVersion("V1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("1.2.3-RC1")).toBe("1.2.3-rc1");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeVersion("  v1.0.0  ")).toBe("1.0.0");
  });
});

describe("fetchGitHubReleaseLatest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns tag_name stripped of leading v by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v2.5.0" }));
    expect(await fetchGitHubReleaseLatest("owner/repo")).toBe("2.5.0");
  });

  it("preserves leading v when stripVPrefix=false", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v2.5.0" }));
    expect(
      await fetchGitHubReleaseLatest("owner/repo", { stripVPrefix: false }),
    ).toBe("v2.5.0");
  });

  it("falls back to name when tag_name is absent", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: "1.0.0" }));
    expect(await fetchGitHubReleaseLatest("owner/repo")).toBe("1.0.0");
  });

  it("returns null when response is not ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    expect(await fetchGitHubReleaseLatest("owner/repo")).toBeNull();
  });

  it("returns null when neither tag_name nor name is provided", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchGitHubReleaseLatest("owner/repo")).toBeNull();
  });

  it("returns null on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await fetchGitHubReleaseLatest("owner/repo")).toBeNull();
  });

  it("refuses a slug that is not a bare owner/repo, without hitting the network", async () => {
    for (const slug of [
      "owner/repo/../../other",
      "owner/repo?ref=main",
      "owner",
      "https://api.github.com/repos/owner/repo",
      "",
    ]) {
      expect(await fetchGitHubReleaseLatest(slug)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls api.github.com with the correct accept header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "1.0.0" }));
    await fetchGitHubReleaseLatest("owner/repo");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/releases/latest");
    expect((init as RequestInit).headers).toMatchObject({
      accept: "application/vnd.github+json",
    });
  });
});

describe("fetchGitHubReleaseTagMatching", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first matching tag (leading-v strip only applies at index 0)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { tag_name: "kustomize/v5.4.3" },
        { tag_name: "kyaml/v0.17.0" },
      ]),
    );
    const tag = await fetchGitHubReleaseTagMatching(
      "kubernetes-sigs/kustomize",
      (t) => t.startsWith("kustomize/"),
    );
    expect(tag).toBe("kustomize/v5.4.3");
  });

  it("strips a true leading v from the matched tag", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ tag_name: "v3.0.0-alpha" }]),
    );
    expect(
      await fetchGitHubReleaseTagMatching("o/r", (t) => t.endsWith("alpha")),
    ).toBe("3.0.0-alpha");
  });

  it("preserves leading v when stripVPrefix=false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ tag_name: "v1.0.0" }]),
    );
    expect(
      await fetchGitHubReleaseTagMatching("o/r", () => true, {
        stripVPrefix: false,
      }),
    ).toBe("v1.0.0");
  });

  it("skips releases without tag_name", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{}, { tag_name: "v2.0.0" }]),
    );
    expect(
      await fetchGitHubReleaseTagMatching("o/r", () => true),
    ).toBe("2.0.0");
  });

  it("returns null when no tag matches", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ tag_name: "v1.0.0" }]),
    );
    expect(
      await fetchGitHubReleaseTagMatching("o/r", () => false),
    ).toBeNull();
  });

  it("returns null when response is not ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([], false));
    expect(
      await fetchGitHubReleaseTagMatching("o/r", () => true),
    ).toBeNull();
  });

  it("returns null on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    expect(
      await fetchGitHubReleaseTagMatching("o/r", () => true),
    ).toBeNull();
  });

  it("honours custom perPage in the URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await fetchGitHubReleaseTagMatching("o/r", () => true, { perPage: 50 });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/o/r/releases?per_page=50");
  });

  it("refuses a slug that is not a bare owner/repo, without hitting the network", async () => {
    expect(
      await fetchGitHubReleaseTagMatching("o/r/../../other", () => true),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
