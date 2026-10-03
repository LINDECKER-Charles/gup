import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures/refs.js";
import { UnscriptedRequestError } from "../system/errors.js";
import { system } from "../system/fake-system.js";

const LATEST = "https://api.github.com/repos/opentofu/opentofu/releases/latest";

describe("fake network", () => {
  it("answers a JSON route with a native Response", async () => {
    await system.load({ platform: "linux", http: [{ url: LATEST, json: { tag_name: "v1.8.0" } }] });

    const response = await fetch(LATEST, { headers: { accept: "application/vnd.github+json" } });

    expect(response.ok).toBe(true);
    expect(response.url).toBe(LATEST);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ tag_name: "v1.8.0" });
    expect(system.trace.requests).toEqual([{ method: "GET", url: LATEST }]);
  });

  it("answers a text route with its status, headers and a fixture body", async () => {
    await system.load({
      platform: "linux",
      http: [
        {
          url: "https://example.test/x",
          status: 202,
          headers: { "content-length": "21" },
          body: fixture("self-test/hello.txt"),
        },
      ],
    });

    const response = await fetch(new URL("https://example.test/x"));

    expect(response.status).toBe(202);
    expect(response.headers.get("content-length")).toBe("21");
    await expect(response.text()).resolves.toBe("hello from a fixture\n");
  });

  it("matches the method as well as the exact URL", async () => {
    await system.load({
      platform: "linux",
      http: [{ url: "https://example.test/q?a=1", method: "POST", body: "posted" }],
    });

    const posted = await fetch("https://example.test/q?a=1", { method: "post" });

    await expect(posted.text()).resolves.toBe("posted");
    await expect(fetch("https://example.test/q?a=1")).rejects.toThrow(UnscriptedRequestError);
    await expect(fetch("https://example.test/q?a=2", { method: "POST" })).rejects.toThrow(
      "POST https://example.test/q?a=1",
    );
    system.acknowledgeUnscripted();
  });

  it("fails like a dead network in explore mode, without recording", async () => {
    await system.load({ platform: "linux" });
    system.explore(true);

    await expect(fetch(LATEST)).rejects.toThrow(new TypeError("fetch failed"));
    expect(system.unscripted).toEqual([]);
  });

  it.each([
    ["status-500", 500, "Internal Server Error"],
    ["bad-json", 200, "{not json"],
  ] as const)("answers a %s fault with HTTP %i", async (mode, status, body) => {
    await system.load({ platform: "linux", http: [{ url: LATEST, json: {} }] });
    system.inject({ on: "http", url: LATEST, mode });

    const response = await fetch(LATEST);

    expect(response.status).toBe(status);
    await expect(response.text()).resolves.toBe(body);
  });

  it("answers a rate-limited fault like GitHub does", async () => {
    await system.load({ platform: "linux", http: [{ url: LATEST, json: {} }] });
    system.inject({ on: "http", url: LATEST, mode: "rate-limited" });

    const response = await fetch(LATEST);

    expect(response.status).toBe(403);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    await expect(response.json()).resolves.toMatchObject({ message: /rate limit exceeded/ });
  });

  it("rejects on network and abort faults like the real fetch", async () => {
    await system.load({ platform: "linux", http: [{ url: LATEST, json: {} }] });
    system.inject({ on: "http", url: LATEST, mode: "network" });
    await expect(fetch(LATEST)).rejects.toThrow(new TypeError("fetch failed"));

    await system.load({ platform: "linux", http: [{ url: LATEST, json: {} }] });
    system.inject({ on: "http", url: LATEST, mode: "abort" });
    await expect(fetch(LATEST)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with the signal's reason when it is already aborted", async () => {
    await system.load({ platform: "linux", http: [{ url: LATEST, json: {} }] });

    await expect(fetch(LATEST, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("answers 404 to everything on a permissive machine", async () => {
    await system.load({ platform: "linux", permissive: true });

    await expect(fetch("https://example.test/any")).resolves.toMatchObject({ status: 404 });
  });

  it("refuses two routes for the same method and URL", async () => {
    await expect(
      system.load({ platform: "linux", http: [{ url: LATEST }, { url: LATEST, method: "GET" }] }),
    ).rejects.toThrow("two http routes");
  });
});
