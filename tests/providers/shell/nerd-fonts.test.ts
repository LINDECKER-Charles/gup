import * as fsPromises from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NerdFontsProvider } from "../../../src/providers/shell/nerd-fonts.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import type { SystemSpec } from "../../support/system/types.js";
import {
  familyZip,
  fontsMachine,
  NERD_FONTS_LOCKFILE,
  NERD_FONTS_RELEASE,
  NERD_FONTS_TAG,
  USER_FONTS_DIR,
} from "./shell.cases.js";

/**
 * Nerd Fonts for the current Windows user: families found in the user's font
 * directory or pinned in gup's lockfile, reinstalled from the release zip,
 * registered under HKCU and pinned again. The update never needs elevation.
 */

const UNPINNED = "non suivi par gup — réinstaller pour pinner";
const WINDOWS_ONLY = "Provider Windows-only (per-user fonts).";
const FIRA_ZIP_URL = familyZip("FiraCode", {}).url;

const provider = () => new NerdFontsProvider();

/** FiraCode's release zip holding `entries`, beside the latest release. */
function firaCodeRelease(entries: Readonly<Record<string, string>>): SystemSpec {
  return fontsMachine({ http: [NERD_FONTS_RELEASE, familyZip("FiraCode", entries)] });
}

beforeEach(() => {
  // The update prints its download and install lines on the terminal.
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NerdFontsProvider.isAvailable", () => {
  it("is Windows-only, and looks at nothing elsewhere", async () => {
    await system.load({ platform: "linux", env: { LOCALAPPDATA: "/home/u/.local" } });
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });

  it("stays hidden when LOCALAPPDATA is unset", async () => {
    await system.load(fontsMachine({ lock: {} }));
    delete process.env["LOCALAPPDATA"];
    await expect(provider().isAvailable()).resolves.toBe(false);
  });

  it("detects fonts installed without gup, before any lockfile exists", async () => {
    await system.load(fontsMachine({ fonts: ["FiraCodeNerdFont-Regular.ttf"] }));
    await expect(provider().isAvailable()).resolves.toBe(true);
  });
});

describe("NerdFontsProvider.listOutdated", () => {
  it("lists nothing, and asks GitHub nothing, without a font or a pin", async () => {
    await system.load(fontsMachine({}));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("groups font files into the release families they come from", async () => {
    const fonts = [
      "FiraCodeNerdFont-Regular.ttf",
      "FiraCodeNerdFontMono-Bold.otf",
      "ignored-file.txt",
      "RandomFontWithoutMarker.ttf",
      "FooBarNerdFont.licence",
      "NerdFont.ttf",
      " NerdFont.ttf",
      "CaskaydiaCoveNerdFont-Regular.ttf",
    ];
    await system.load(fontsMachine({ fonts }));
    const unpinned = (family: string) => ({
      id: family,
      name: `Nerd Font — ${family}`,
      current: "?",
      latest: NERD_FONTS_TAG,
      note: UNPINNED,
    });
    // CaskaydiaCove is the patched name of the CascadiaCode release.
    await expect(provider().listOutdated()).resolves.toEqual([
      unpinned("CascadiaCode"),
      unpinned("FiraCode"),
    ]);
  });

  it("adds the pinned families and hides those already at the latest tag", async () => {
    const lock = { FiraCode: NERD_FONTS_TAG, Meslo: "v3.3.0" };
    await system.load(fontsMachine({ fonts: ["FiraCodeNerdFont-Regular.ttf"], lock }));
    await expect(provider().listOutdated()).resolves.toEqual([
      { id: "Meslo", name: "Nerd Font — Meslo", current: "v3.3.0", latest: NERD_FONTS_TAG },
    ]);
  });

  it.each([
    ["not JSON", "not json at all", []],
    ["an array", ["nope"], []],
    ["non-string pins", { FiraCode: "v3.3.0", Bogus: 123, Other: null }, ["FiraCode"]],
  ])("reads a lockfile holding %s as the pins it can trust", async (_label, lock, ids) => {
    await system.load(fontsMachine({ lock }));
    const rows = await provider().listOutdated();
    expect(rows.map((row) => row.id)).toEqual(ids);
  });
});

describe("NerdFontsProvider.update — refusals", () => {
  it("refuses off Windows", async () => {
    await system.load({ platform: "linux", env: { LOCALAPPDATA: "/home/u/.local" } });
    await expect(provider().update("FiraCode")).resolves.toEqual({
      id: "FiraCode",
      success: false,
      message: WINDOWS_ONLY,
    });
  });

  it("refuses without LOCALAPPDATA, where neither the fonts nor the lockfile live", async () => {
    await system.load(fontsMachine({}));
    delete process.env["LOCALAPPDATA"];
    await expect(provider().update("FiraCode")).resolves.toMatchObject({ message: WINDOWS_ONLY });
  });

  it("refuses a family name that could leave the release or the fonts directory", async () => {
    await system.load(fontsMachine({}));
    await expect(provider().update("../etc/passwd")).resolves.toEqual({
      id: "../etc/passwd",
      success: false,
      message: 'Nom de famille invalide: "../etc/passwd"',
    });
    expect(system.trace.requests).toEqual([]);
  });
});

describe("NerdFontsProvider.update — download", () => {
  it("fails when the latest release is unknown", async () => {
    await system.load(fontsMachine({}));
    system.inject({ on: "http", url: NERD_FONTS_RELEASE.url, mode: "status-500" });
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message: "Impossible de récupérer la dernière release Nerd Fonts.",
    });
  });

  it("fails, pointing at the release page, when the family has no asset", async () => {
    const missing = { url: FIRA_ZIP_URL, status: 404, body: "Not Found" };
    await system.load(fontsMachine({ http: [NERD_FONTS_RELEASE, missing] }));
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message:
        "Asset introuvable (HTTP 404). Vérifie le nom : " +
        `https://github.com/ryanoasis/nerd-fonts/releases/tag/${NERD_FONTS_TAG}`,
    });
  });

  it("fails with the network's reason when the download breaks", async () => {
    await system.load(firaCodeRelease({}));
    system.inject({ on: "http", url: FIRA_ZIP_URL, mode: "network" });
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message: "Échec téléchargement : fetch failed",
    });
  });

  it("reports a download failure that is not an Error as text", async () => {
    await system.load(firaCodeRelease({}));
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (input === FIRA_ZIP_URL) throw "string-error";
      return system.fetch(input, init);
    });
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      message: "Échec téléchargement : string-error",
    });
  });
});

describe("NerdFontsProvider.update — install", () => {
  it("fails when the archive holds no Nerd Font file", async () => {
    await system.load(firaCodeRelease({ "readme.txt": "", "fonts/": "" }));
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message: "Aucun fichier *NerdFont*.(ttf|otf) trouvé dans FiraCode.zip",
    });
    expect(installArgvs()).toEqual([]);
  });

  it("fails with the archive's own error when the zip is corrupt", async () => {
    const corrupt = { url: FIRA_ZIP_URL, bytes: new Uint8Array(Buffer.from("not a zip")) };
    await system.load(fontsMachine({ http: [NERD_FONTS_RELEASE, corrupt] }));
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message: "ADM-ZIP: Invalid or unsupported zip format. No END header found",
    });
  });

  it("reports a failure that is not an Error as text", async () => {
    await system.load(firaCodeRelease({ "FiraCodeNerdFont-Regular.ttf": "ttf" }));
    // Node rejects with Errors only; the provider still guards against anything else.
    replaceForTest(fsPromises, "copyFile", () => Promise.reject("thing-broke"));
    await expect(provider().update("FiraCode")).resolves.toMatchObject({
      success: false,
      message: "thing-broke",
    });
  });

  it("copies every font, registers each under HKCU, and pins the family", async () => {
    const entries = {
      "FiraCodeNerdFont-Regular.ttf": "ttf",
      "subdir/FiraCodeNerdFontMono-Bold.otf": "otf",
    };
    const http = [NERD_FONTS_RELEASE, familyZip("FiraCode", entries)];
    await system.load(fontsMachine({ lock: { Meslo: "v3.3.0" }, http }));
    await expect(provider().update("FiraCode")).resolves.toEqual({ id: "FiraCode", success: true });
    const installed = `${USER_FONTS_DIR}\\FiraCodeNerdFontMono-Bold.otf`;
    await expect(fsPromises.readFile(installed, "utf8")).resolves.toBe("otf");
    const [registration] = installArgvs();
    expect(registration?.at(-1)).toContain(
      `-Name 'FiraCodeNerdFontMono-Bold (OpenType)' -PropertyType String -Value '${installed}'`,
    );
    const pins = { Meslo: "v3.3.0", FiraCode: NERD_FONTS_TAG };
    await expect(fsPromises.readFile(NERD_FONTS_LOCKFILE, "utf8")).resolves.toBe(
      `${JSON.stringify(pins, null, 2)}\n`,
    );
  });

  it("still succeeds when the temporary directory cannot be removed", async () => {
    await system.load(firaCodeRelease({ "FiraCodeNerdFont-Regular.ttf": "ttf" }));
    replaceForTest(fsPromises, "rm", () => Promise.reject(new Error("EBUSY")));
    await expect(provider().update("FiraCode")).resolves.toEqual({ id: "FiraCode", success: true });
  });
});
