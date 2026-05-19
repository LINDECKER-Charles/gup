import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHashicorpLatest } from "../../src/core/hashicorp-releases.js";

type FetchFn = typeof fetch;

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("fetchHashicorpLatest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as FetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns version on a 200 response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "1.7.5" }));
    expect(await fetchHashicorpLatest("terraform")).toBe("1.7.5");
  });

  it("returns null on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    expect(await fetchHashicorpLatest("terraform")).toBeNull();
  });

  it("returns null when version field is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchHashicorpLatest("terraform")).toBeNull();
  });

  it("returns null on a network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    expect(await fetchHashicorpLatest("terraform")).toBeNull();
  });

  it("hits api.releases.hashicorp.com with the product slug", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "1.0.0" }));
    await fetchHashicorpLatest("vault");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.releases.hashicorp.com/v1/releases/vault/latest",
    );
  });
});
