import { describe, expect, it } from "vitest";
import {
  fetchMicrosoftMarketplaceLatest,
  fetchOpenVsxLatest,
  scanVsCodeLikeExtensions,
} from "../../../src/providers/ide/vscode-like.js";
import { VsCodiumExtProvider } from "../../../src/providers/ide/vscodium-ext.js";
import { system } from "../../support/system/fake-system.js";
import {
  editorMachine,
  MARKETPLACE_QUERY_URL,
  marketplaceRoute,
  openVsxRoute,
} from "./vscode-like.cases.js";

/** VS Code-family extension scan: `id@version` lines, then one gallery lookup per extension. */

/** VSCodium on linux listing `listing`, Open VSX answering `http`. */
function codium(listing: string, http: Parameters<typeof editorMachine>[0]["http"] = []) {
  return editorMachine({ platform: "linux", binary: "codium", listing, http });
}

describe("scanVsCodeLikeExtensions", () => {
  it("keeps only id@version lines, and asks no gallery when none is left", async () => {
    await system.load(codium("garbage\nno-at-sign-here\n"));
    await expect(new VsCodiumExtProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("splits a line on its last @, so an @ in the id survives", async () => {
    const http = [openVsxRoute("weird@publisher", "ext", "1.1.0")];
    await system.load(codium("weird@publisher.ext@1.0.0\n", http));
    await expect(new VsCodiumExtProvider().listOutdated()).resolves.toEqual([
      { id: "weird@publisher.ext", name: "weird@publisher.ext", current: "1.0.0", latest: "1.1.0" },
    ]);
  });

  it("lists only what the gallery knows a newer version of", async () => {
    const unknown = { ...openVsxRoute("b", "unknown", "0"), status: 404, json: {} };
    const http = [openVsxRoute("a", "same", "1.0.0"), unknown, openVsxRoute("c", "upd", "3.1.0")];
    await system.load(codium("a.same@1.0.0\nb.unknown@2.0.0\nc.upd@3.0.0\n", http));
    await expect(new VsCodiumExtProvider().listOutdated()).resolves.toEqual([
      { id: "c.upd", name: "c.upd", current: "3.0.0", latest: "3.1.0" },
    ]);
  });

  it("honours a custom concurrency over CRLF output", async () => {
    const http = ["a", "b", "c"].map((name) => openVsxRoute("p", name, "1.1.0"));
    await system.load(codium("p.a@1.0.0\r\np.b@1.0.0\r\np.c@1.0.0", http));
    const rows = await scanVsCodeLikeExtensions({
      binary: "codium",
      fetchLatest: fetchOpenVsxLatest,
      concurrency: 1,
    });
    expect(rows.map((row) => row.id)).toEqual(["p.a", "p.b", "p.c"]);
  });
});

describe("fetchMicrosoftMarketplaceLatest", () => {
  it("POSTs one query naming the extension, restricted to VS Code", async () => {
    await system.load({ platform: "win32", http: [marketplaceRoute("2024.5.0")] });
    await expect(fetchMicrosoftMarketplaceLatest("ms-python.python")).resolves.toBe("2024.5.0");
    const [request] = system.trace.requests;
    expect(request).toMatchObject({ method: "POST", url: MARKETPLACE_QUERY_URL });
    expect(JSON.parse(request?.body ?? "{}")).toEqual({
      filters: [
        {
          criteria: [
            { filterType: 8, value: "Microsoft.VisualStudio.Code" },
            { filterType: 7, value: "ms-python.python" },
          ],
        },
      ],
      flags: 0x100,
    });
  });

  it.each([
    ["no results", {}],
    ["empty results", { results: [] }],
    ["no extension", { results: [{ extensions: [] }] }],
    ["no version", { results: [{ extensions: [{ versions: [] }] }] }],
    ["a version without its number", { results: [{ extensions: [{ versions: [{}] }] }] }],
  ])("answers null for a valid answer with %s", async (_label, json) => {
    await system.load({
      platform: "win32",
      http: [{ url: MARKETPLACE_QUERY_URL, method: "POST", json }],
    });
    await expect(fetchMicrosoftMarketplaceLatest("x.y")).resolves.toBeNull();
  });
});

describe("fetchOpenVsxLatest", () => {
  it("asks nothing for an id without a publisher", async () => {
    await system.load({ platform: "linux" });
    await expect(fetchOpenVsxLatest("noseparator")).resolves.toBeNull();
    expect(system.trace.requests).toEqual([]);
  });

  it("URL-encodes the publisher and the name", async () => {
    const route = openVsxRoute("my-publisher", "my+name", "1.2.3");
    await system.load({ platform: "linux", http: [route] });
    await expect(fetchOpenVsxLatest("my-publisher.my+name")).resolves.toBe("1.2.3");
    expect(system.trace.requests[0]?.url).toBe("https://open-vsx.org/api/my-publisher/my%2Bname");
  });

  it("answers null when the extension has no version field", async () => {
    const route = { ...openVsxRoute("foo", "bar", "0"), json: {} };
    await system.load({ platform: "linux", http: [route] });
    await expect(fetchOpenVsxLatest("foo.bar")).resolves.toBeNull();
  });
});
