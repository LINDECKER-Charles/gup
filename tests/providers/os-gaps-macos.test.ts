import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The "everything else that owns software on a Mac (or a BSD)" layer:
 * Nix, Sparkle-enabled .app bundles, Fink, pkgin and pkgx.
 *
 * Every one of these providers is gated on a platform, shells out, or fetches
 * over HTTP — so the whole surface (`node:fs`, `node:fs/promises`, `node:os`,
 * the runner, `fetch`) is mocked here and no test touches the real machine.
 */

const { commandExistsMock, runMock, runInheritMock, whichFirstMock } = vi.hoisted(
  () => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }),
);

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  whichFirst: whichFirstMock,
  isElevated: vi.fn(),
}));

const { fetchGitHubReleaseLatestMock, fetchGitHubReleaseTagMatchingMock } = vi.hoisted(
  () => ({
    fetchGitHubReleaseLatestMock: vi.fn(),
    fetchGitHubReleaseTagMatchingMock: vi.fn(),
  }),
);

vi.mock("../../src/core/gh-releases.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/core/gh-releases.js")>(
      "../../src/core/gh-releases.js",
    );
  return {
    ...actual,
    fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
    fetchGitHubReleaseTagMatching: fetchGitHubReleaseTagMatchingMock,
  };
});

const { delegateUpdateMock, detectInstallSourceMock, describeSourceMock } = vi.hoisted(
  () => ({
    delegateUpdateMock: vi.fn(),
    detectInstallSourceMock: vi.fn(),
    describeSourceMock: vi.fn(),
  }),
);

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
}));

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: existsSyncMock };
});

const { readdirMock } = vi.hoisted(() => ({ readdirMock: vi.fn() }));
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readdir: readdirMock };
});

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn(() => "/home/u") }));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

import {
  NixProvider,
  compareNumericVersions,
  highestStableTag,
  parseDeterminateVersion,
  parseNixVersion,
} from "../../src/providers/os/nix.js";
import {
  SparkleProvider,
  compareVersions as compareSparkleVersions,
  parseAppcastVersions,
} from "../../src/providers/os/sparkle.js";
import { FinkProvider, parseFinkOutdated } from "../../src/providers/os/fink.js";
import {
  PkginProvider,
  parsePkginList,
  parsePkginOutdated,
  parseUpgradeCandidates,
} from "../../src/providers/os/pkgin.js";
import {
  PkgxProvider,
  compareVersions as comparePkgxVersions,
  parsePkgxVersion,
} from "../../src/providers/os/pkgx.js";
import type { OutdatedPackage } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

interface XmlResponseInit {
  ok?: boolean;
  url?: string;
  contentLength?: string | null;
}

function xmlResponse(body: string, init: XmlResponseInit = {}): Response {
  const {
    ok = true,
    url = "https://feeds.example.com/appcast.xml",
    contentLength = null,
  } = init;
  return {
    ok,
    url,
    headers: { get: (name: string) => (name === "content-length" ? contentLength : null) },
    text: async () => body,
  } as unknown as Response;
}

function row(id: string): OutdatedPackage {
  return { id, current: "1", latest: "2" };
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

const ORIGINAL_GETUID = process.getuid;

function setGetuid(value: (() => number) | undefined): void {
  Object.defineProperty(process, "getuid", {
    value,
    configurable: true,
    writable: true,
  });
}

const ORIGINAL_ENV = { ...process.env };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  whichFirstMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  fetchGitHubReleaseTagMatchingMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(false);
  readdirMock.mockReset();
  readdirMock.mockResolvedValue([]);
  homedirMock.mockReset();
  homedirMock.mockReturnValue("/home/u");
  process.env = { ...ORIGINAL_ENV };
  delete process.env["NIX_PROFILES"];
  delete process.env["XDG_STATE_HOME"];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  setGetuid(ORIGINAL_GETUID);
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Nix
// ---------------------------------------------------------------------------

const NIX_TAGS_URL = "https://api.github.com/repos/NixOS/nix/tags?per_page=100";

/** Real shape of `nix --version` on an upstream build. */
const NIX_UPSTREAM_VERSION = "nix (Nix) 2.28.3";
/** Real shape on a Determinate build: product version first, Nix version last. */
const NIX_DETERMINATE_VERSION = "nix (Determinate Nix 3.21.9) 2.35.1";

/** Trimmed `/repos/NixOS/nix/tags` payload — repository order, not version order. */
const NIX_TAGS_BODY = [
  { name: "2.28.3", commit: { sha: "aaa" } },
  { name: "2.30.0", commit: { sha: "bbb" } },
  { name: "2.9.0", commit: { sha: "ccc" } },
  { name: "2.31.0-pre", commit: { sha: "ddd" } },
  { name: "latest", commit: { sha: "eee" } },
];

const NIX_PROFILE_ROW = {
  id: "profile",
  name: "profil utilisateur",
  current: "?",
  latest: "refresh",
  note: "nix profile upgrade --all — réévalue chaque flake du profil",
};

const PROFILE_UPGRADE_ARGV = [
  "--extra-experimental-features",
  "nix-command flakes",
  "profile",
  "upgrade",
  "--all",
];

describe("NixProvider.isAvailable", () => {
  it("never probes the binary on Windows — WSL Nix belongs to wsl-nix", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new NixProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("follows commandExists on macOS and Linux", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new NixProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("nix");

    setPlatform("linux");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new NixProvider().isAvailable()).resolves.toBe(false);
  });

  it("degrades to false when the probe itself throws", async () => {
    setPlatform("darwin");
    commandExistsMock.mockRejectedValueOnce(new Error("spawn"));
    await expect(new NixProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("NixProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("darwin");
  });

  it("compares a standalone install against the newest stable upstream tag", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/nix/var/nix/profiles/default/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse(NIX_TAGS_BODY));

    const rows = await new NixProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith("nix", ["--version"]);
    expect(fetchMock).toHaveBeenCalledWith(
      NIX_TAGS_URL,
      expect.objectContaining({ headers: { accept: "application/vnd.github+json" } }),
    );
    expect(rows).toEqual([
      {
        id: "nix",
        name: "nix",
        current: "2.28.3",
        latest: "2.30.0",
        note: "nix upgrade-nix — install mono-utilisateur uniquement",
      },
    ]);
  });

  it("reads the Determinate product version and its own release feed", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_DETERMINATE_VERSION));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.22.0");

    const rows = await new NixProvider().listOutdated();

    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(
      "DeterminateSystems/nix-src",
    );
    // The upstream tags endpoint is never spent on a Determinate install.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(whichFirstMock).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        id: "nix",
        name: "nix",
        current: "3.21.9",
        latest: "3.22.0",
        note: "Determinate Nix — mise à jour par sudo determinate-nixd upgrade",
      },
    ]);
  });

  it("marks a NixOS system closure so the row names nixos-rebuild", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/run/current-system/sw/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse(NIX_TAGS_BODY));

    const rows = await new NixProvider().listOutdated();

    expect(rows[0]?.note).toBe("profil système NixOS — mise à jour par nixos-rebuild");
  });

  it("emits nothing for the binary when `nix --version` fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits nothing when the version banner carries no number", async () => {
    runMock.mockResolvedValueOnce(mkRun("\n   \n"));
    whichFirstMock.mockResolvedValueOnce(null);
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits nothing when a Determinate banner drops its product version", async () => {
    runMock.mockResolvedValueOnce(mkRun("nix (Determinate Nix) 2.35.1"));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("emits nothing when the install is already on the newest tag", async () => {
    runMock.mockResolvedValueOnce(mkRun("nix (Nix) 2.30.0"));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse(NIX_TAGS_BODY));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a rate-limit body arriving where a tag list is expected", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        message: "API rate limit exceeded for 203.0.113.7.",
        documentation_url: "https://docs.github.com/rest/overview/rate-limits",
      }),
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a non-ok tags response", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse([], false));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a rejected fetch", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a tag list whose entries are not objects", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse([null, 42, { name: 7 }, "2.99.0"]));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the runner rejects", async () => {
    runMock.mockRejectedValueOnce(new Error("spawn EACCES"));
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("adds the profile row when ~/.nix-profile exists", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    existsSyncMock.mockImplementation((p: unknown) => p === "/home/u/.nix-profile");
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("honours XDG_STATE_HOME for the profile probe", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    process.env["XDG_STATE_HOME"] = "/home/u/.xdgstate";
    existsSyncMock.mockImplementation(
      (p: unknown) => p === "/home/u/.xdgstate/nix/profile",
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("falls back to $XDG_STATE_HOME's default when the variable is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    process.env["XDG_STATE_HOME"] = "";
    existsSyncMock.mockImplementation(
      (p: unknown) => p === "/home/u/.local/state/nix/profile",
    );
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("counts a NIX_PROFILES entry under $HOME, never the system profile", async () => {
    runMock.mockResolvedValue(mkRun("", true));
    process.env["NIX_PROFILES"] = "/nix/var/nix/profiles/default";
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);

    process.env["NIX_PROFILES"] = "/nix/var/nix/profiles/default /home/u/.nix-profile";
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("accepts a home directory already carrying a trailing slash", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    homedirMock.mockReturnValue("/home/u/");
    process.env["NIX_PROFILES"] = "/home/u/.nix-profile";
    await expect(new NixProvider().listOutdated()).resolves.toEqual([NIX_PROFILE_ROW]);
  });

  it("emits no profile row when homedir is unresolvable", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    homedirMock.mockImplementation(() => {
      throw new Error("no passwd entry");
    });
    process.env["NIX_PROFILES"] = "/home/u/.nix-profile";
    existsSyncMock.mockReturnValue(true);
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("emits no profile row when homedir is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    homedirMock.mockReturnValue("");
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("treats an existsSync throw as 'no profile there'", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    existsSyncMock.mockImplementation(() => {
      throw new Error("EPERM");
    });
    await expect(new NixProvider().listOutdated()).resolves.toEqual([]);
  });

  it("reports both rows at once", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    fetchMock.mockResolvedValueOnce(jsonResponse(NIX_TAGS_BODY));
    existsSyncMock.mockImplementation((p: unknown) => p === "/home/u/.nix-profile");

    const rows = await new NixProvider().listOutdated();
    expect(rows.map((r) => r.id)).toEqual(["nix", "profile"]);
  });
});

describe("NixProvider.update", () => {
  beforeEach(() => {
    setPlatform("linux");
  });

  it("upgrades the profile through the new CLI, feature flags included", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NixProvider().update("profile");
    expect(runInheritMock).toHaveBeenCalledWith("nix", PROFILE_UPGRADE_ARGV);
    expect(res).toEqual({ id: "profile", success: true });
  });

  it("does not retry with nix-env after a Ctrl+C skip", async () => {
    runInheritMock.mockResolvedValueOnce({ ...mkRun("", true), aborted: true });
    const res = await new NixProvider().update("profile");
    expect(res).toEqual({ id: "profile", success: false });
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry with nix-env after a timeout", async () => {
    runInheritMock.mockResolvedValueOnce({ ...mkRun("", true), timedOut: true });
    const res = await new NixProvider().update("profile");
    expect(res).toEqual({ id: "profile", success: false });
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("refuses the nix-env fallback on a profile managed by `nix profile`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    existsSyncMock.mockImplementation(
      (p: unknown) => p === "/home/u/.nix-profile/manifest.json",
    );
    const res = await new NixProvider().update("profile");
    expect(res).toMatchObject({ id: "profile", success: false });
    expect(res.message).toMatch(/Pas de repli sur nix-env/);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("reports both failures when nix-env is missing", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    commandExistsMock.mockResolvedValueOnce(false);
    const res = await new NixProvider().update("profile");
    expect(res).toMatchObject({ id: "profile", success: false });
    expect(res.message).toMatch(/nix-env est introuvable/);
  });

  it("falls back to `nix-env -u '*'` on a classic profile", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun(""));
    commandExistsMock.mockResolvedValueOnce(true);
    const res = await new NixProvider().update("profile");
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "nix-env", ["-u", "*"]);
    expect(res).toEqual({ id: "profile", success: true });
  });

  it("reports the double failure when nix-env fails too", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun("", true));
    commandExistsMock.mockResolvedValueOnce(true);
    const res = await new NixProvider().update("profile");
    expect(res).toMatchObject({ id: "profile", success: false });
    expect(res.message).toMatch(/nix-env -u/);
  });

  it("runs `nix upgrade-nix` without the experimental flag on a standalone install", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NixProvider().update("nix");
    expect(runInheritMock).toHaveBeenCalledWith("nix", ["upgrade-nix"]);
    expect(res).toEqual({ id: "nix", success: true });
  });

  it("explains the multi-user refusal when upgrade-nix fails", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce(null);
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new NixProvider().update("nix");
    expect(res).toMatchObject({ id: "nix", success: false });
    expect(res.message).toMatch(/multi-utilisateur/);
  });

  it("still tries upgrade-nix when the version probe itself failed", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new NixProvider().update("nix");
    expect(whichFirstMock).not.toHaveBeenCalled();
    expect(res).toEqual({ id: "nix", success: true });
  });

  it("skips the binary upgrade on Determinate and names its own command", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_DETERMINATE_VERSION));
    const res = await new NixProvider().update("nix");
    expect(res).toMatchObject({ id: "nix", success: false, skipped: true });
    expect(res.message).toMatch(/determinate-nixd upgrade/);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips the binary upgrade on a NixOS system closure", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/run/current-system/sw/bin/nix-env");
    const res = await new NixProvider().update("nix");
    expect(res).toMatchObject({ id: "nix", success: false, skipped: true });
    expect(res.message).toMatch(/nixos-rebuild switch/);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown target by name", async () => {
    const res = await new NixProvider().update("hello");
    expect(res).toEqual({
      id: "hello",
      success: false,
      message: "Cible inconnue pour nix : hello",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("turns a rejected spawn into a failed outcome", async () => {
    runInheritMock.mockRejectedValueOnce(new Error("spawn ENOENT"));
    const res = await new NixProvider().update("profile");
    expect(res).toEqual({
      id: "profile",
      success: false,
      message: "La commande nix n'a pas pu être lancée.",
    });
  });
});

describe("NixProvider.updateAll", () => {
  it("does nothing for an empty set", async () => {
    await expect(new NixProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("runs the two targets sequentially", async () => {
    runMock.mockResolvedValueOnce(mkRun(NIX_UPSTREAM_VERSION));
    whichFirstMock.mockResolvedValueOnce("/usr/bin/nix-env");
    runInheritMock
      .mockResolvedValueOnce(mkRun("")) // nix upgrade-nix
      .mockResolvedValueOnce(mkRun("", true)); // nix profile upgrade --all
    commandExistsMock.mockResolvedValueOnce(false);

    const res = await new NixProvider().updateAll([row("nix"), row("profile")]);

    expect(res[0]).toEqual({ id: "nix", success: true });
    expect(res[1]).toMatchObject({ id: "profile", success: false });
    expect(runInheritMock).toHaveBeenNthCalledWith(1, "nix", ["upgrade-nix"]);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "nix", PROFILE_UPGRADE_ARGV);
  });
});

describe("nix parsers", () => {
  it("parseNixVersion takes the last version-shaped token of the first line", () => {
    expect(parseNixVersion(NIX_UPSTREAM_VERSION)).toBe("2.28.3");
    expect(parseNixVersion(NIX_DETERMINATE_VERSION)).toBe("2.35.1");
    expect(parseNixVersion("nix (Nix) 2.18\nextra 9.9.9")).toBe("2.18");
  });

  it("parseNixVersion is null on blank and garbage input", () => {
    expect(parseNixVersion("")).toBeNull();
    expect(parseNixVersion("\n\n   \n")).toBeNull();
    expect(parseNixVersion("command not found")).toBeNull();
  });

  it("parseDeterminateVersion reads the product version, with or without a v", () => {
    expect(parseDeterminateVersion(NIX_DETERMINATE_VERSION)).toBe("3.21.9");
    expect(parseDeterminateVersion("nix (Determinate Nix v3.22) 2.35.1")).toBe("3.22");
  });

  it("parseDeterminateVersion is null on an upstream build and on blank input", () => {
    expect(parseDeterminateVersion(NIX_UPSTREAM_VERSION)).toBeNull();
    expect(parseDeterminateVersion("nix (Determinate Nix) 2.35.1")).toBeNull();
    expect(parseDeterminateVersion("")).toBeNull();
  });

  it("highestStableTag ignores order, pre-releases and pointer tags", () => {
    expect(highestStableTag(["2.28.3", "2.30.0", "2.9.0"])).toBe("2.30.0");
    expect(highestStableTag([" 2.30.0 ", "2.31.0-pre", "latest", "2.18"])).toBe("2.30.0");
    expect(highestStableTag([])).toBeNull();
    expect(highestStableTag(["", "nightly"])).toBeNull();
  });

  it("compareNumericVersions sorts 1.10 above 1.9", () => {
    expect(compareNumericVersions("1.10", "1.9")).toBeGreaterThan(0);
    expect(compareNumericVersions("1.9", "1.10")).toBeLessThan(0);
    expect(compareNumericVersions("2.28.3", "2.28.3")).toBe(0);
    // A leading `v` is stripped and a missing component counts as 0.
    expect(compareNumericVersions("v2.30.0", "2.30")).toBe(0);
    expect(compareNumericVersions("v2.30.1", "2.30")).toBeGreaterThan(0);
    expect(compareNumericVersions("2.30", "2.30.1")).toBeLessThan(0);
    expect(compareNumericVersions("2.x", "2.0")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sparkle
// ---------------------------------------------------------------------------

const APPCAST_ELEMENT_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Transmit 5</title>
    <link>https://www.panic.com/updates/transmit5.xml</link>
    <item>
      <title>Version 5.10.4</title>
      <pubDate>Tue, 03 Jun 2025 16:04:00 +0000</pubDate>
      <sparkle:version>5104</sparkle:version>
      <sparkle:shortVersionString>5.10.4</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>11.0</sparkle:minimumSystemVersion>
      <enclosure url="https://download.panic.com/transmit/Transmit%205.10.4.zip" length="41234567" type="application/octet-stream" sparkle:edSignature="Ky/9v0k="/>
    </item>
    <item>
      <title>Version 5.10.3</title>
      <pubDate>Mon, 12 May 2025 09:00:00 +0000</pubDate>
      <sparkle:version>5103</sparkle:version>
      <sparkle:shortVersionString>5.10.3</sparkle:shortVersionString>
      <enclosure url="https://download.panic.com/transmit/Transmit%205.10.3.zip" length="41000000" type="application/octet-stream"/>
    </item>
  </channel>
</rss>`;

const APPCAST_ATTRIBUTE_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>iTerm2</title>
    <item>
      <title>3.5.14</title>
      <description>Bug fixes.</description>
      <pubDate>Thu, 10 Apr 2025 12:00:00 -0700</pubDate>
      <enclosure sparkle:version="3.5.14" sparkle:shortVersionString="3.5.14" url="https://iterm2.com/downloads/stable/iTerm2-3_5_14.zip" length="30000000" type="application/octet-stream"/>
    </item>
    <item>
      <title>3.5.13</title>
      <enclosure sparkle:version="3.5.13" sparkle:shortVersionString="3.5.13" url="https://iterm2.com/downloads/stable/iTerm2-3_5_13.zip" length="29000000" type="application/octet-stream"/>
    </item>
  </channel>
</rss>`;

type PlistTable = Record<string, Record<string, string>>;

/**
 * Wire `existsSync` + `readdir` to an in-memory /Applications tree, and `run`
 * to a `plutil -extract <key> raw -o - <plist>` table. Anything absent from the
 * table exits 1, which is exactly how plutil reports a missing key.
 */
function mockMacFs(dirs: Record<string, string[]>, plists: PlistTable): void {
  existsSyncMock.mockImplementation((p: unknown) => {
    const path = String(p);
    if (path.endsWith("/Contents/Info.plist")) {
      return Object.prototype.hasOwnProperty.call(plists, path);
    }
    return Object.prototype.hasOwnProperty.call(dirs, path);
  });
  readdirMock.mockImplementation(async (p: unknown) => dirs[String(p)] ?? []);
  runMock.mockImplementation(async (cmd: unknown, args: unknown) => {
    if (cmd !== "plutil") return mkRun("", true);
    const argv = args as string[];
    const value = plists[argv[5] ?? ""]?.[argv[1] ?? ""];
    return value === undefined ? mkRun("", true) : mkRun(`${value}\n`);
  });
}

const TRANSMIT_PLIST = "/Applications/Transmit.app/Contents/Info.plist";
const ITERM_PLIST = "/Applications/iTerm.app/Contents/Info.plist";

describe("SparkleProvider.isAvailable", () => {
  it("never probes plutil off macOS", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new SparkleProvider().isAvailable()).resolves.toBe(false);
    setPlatform("win32");
    await expect(new SparkleProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("probes plutil on macOS", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new SparkleProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("plutil");
  });

  it("degrades to false when the probe throws", async () => {
    setPlatform("darwin");
    commandExistsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new SparkleProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("SparkleProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("darwin");
  });

  it("returns [] off macOS without touching the filesystem", async () => {
    setPlatform("linux");
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(readdirMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("reports an app behind its appcast (version as child elements)", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app", "ReadMe.txt"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
          CFBundleVersion: "5103",
        },
      },
    );
    fetchMock.mockResolvedValue(xmlResponse(APPCAST_ELEMENT_SHAPE));

    const rows = await new SparkleProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith("plutil", [
      "-extract",
      "SUFeedURL",
      "raw",
      "-o",
      "-",
      TRANSMIT_PLIST,
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.panic.com/updates/transmit5.xml",
      expect.objectContaining({
        headers: {
          accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        },
      }),
    );
    expect(rows).toEqual([
      {
        id: "Transmit",
        name: "Transmit",
        current: "5.10.3",
        latest: "5.10.4",
        note: "Sparkle — updater intégré à l'app",
      },
    ]);
  });

  it("reports an app behind its appcast (version as enclosure attributes)", async () => {
    mockMacFs(
      { "/Applications": ["iTerm.app"] },
      {
        [ITERM_PLIST]: {
          SUFeedURL: "https://iterm2.com/appcasts/final_modern.xml",
          CFBundleShortVersionString: "3.5.13",
          CFBundleVersion: "3.5.13",
        },
      },
    );
    fetchMock.mockResolvedValue(xmlResponse(APPCAST_ATTRIBUTE_SHAPE));

    const rows = await new SparkleProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "iTerm",
        name: "iTerm",
        current: "3.5.13",
        latest: "3.5.14",
        note: "Sparkle — updater intégré à l'app",
      },
    ]);
  });

  it("says nothing about an app already on the advertised version", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.4",
          CFBundleVersion: "5104",
        },
      },
    );
    fetchMock.mockResolvedValue(xmlResponse(APPCAST_ELEMENT_SHAPE));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("costs exactly one plutil call for a bundle with no SUFeedURL", async () => {
    mockMacFs(
      { "/Applications": ["Calculator.app"] },
      { "/Applications/Calculator.app/Contents/Info.plist": {} },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a cleartext feed before it reaches the network", async () => {
    mockMacFs(
      { "/Applications": ["Legacy.app"] },
      {
        "/Applications/Legacy.app/Contents/Info.plist": {
          SUFeedURL: "http://updates.example.com/legacy.xml",
          CFBundleShortVersionString: "1.0.0",
        },
      },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops an unparsable SUFeedURL", async () => {
    mockMacFs(
      { "/Applications": ["Legacy.app"] },
      {
        "/Applications/Legacy.app/Contents/Info.plist": {
          SUFeedURL: "not a url at all",
          CFBundleShortVersionString: "1.0.0",
        },
      },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a bundle whose plist has no version keys at all", async () => {
    mockMacFs(
      { "/Applications": ["Broken.app"] },
      {
        "/Applications/Broken.app/Contents/Info.plist": {
          SUFeedURL: "https://feeds.example.com/broken.xml",
        },
      },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a bundle whose plutil prints an empty value", async () => {
    mockMacFs(
      { "/Applications": ["Blank.app"] },
      { "/Applications/Blank.app/Contents/Info.plist": { SUFeedURL: "   " } },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives a feed that 404s", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockResolvedValue(xmlResponse("<html>Not Found</html>", { ok: false }));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("survives a rejected feed fetch", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockRejectedValue(new Error("timeout"));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("drops a feed whose redirect chain left TLS behind", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(APPCAST_ELEMENT_SHAPE, { url: "http://mirror.example.com/feed.xml" }),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("drops a response declaring an implausible size", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(APPCAST_ELEMENT_SHAPE, { contentLength: "999999999" }),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("ignores a non-numeric content-length and reads the body anyway", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(APPCAST_ELEMENT_SHAPE, { contentLength: "chunked" }),
    );
    const rows = await new SparkleProvider().listOutdated();
    expect(rows[0]?.latest).toBe("5.10.4");
  });

  it("compares builds when neither side carries a marketing version", async () => {
    mockMacFs(
      { "/Applications": ["Build.app"] },
      {
        "/Applications/Build.app/Contents/Info.plist": {
          SUFeedURL: "https://feeds.example.com/build.xml",
          CFBundleVersion: "100",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(
        `<rss><channel><item><title>b102</title><sparkle:version>102</sparkle:version></item></channel></rss>`,
      ),
    );
    const rows = await new SparkleProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "Build",
        name: "Build",
        current: "100",
        latest: "102",
        note: "Sparkle — comparaison sur le build, updater intégré à l'app",
      },
    ]);
  });

  it("refuses a bare counter against a three-part marketing version", async () => {
    mockMacFs(
      { "/Applications": ["iTerm.app"] },
      {
        [ITERM_PLIST]: {
          SUFeedURL: "https://iterm2.com/appcasts/final_modern.xml",
          CFBundleVersion: "100",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(
        `<rss><channel><item><enclosure sparkle:version="3.6.11" url="https://iterm2.com/x.zip"/></item></channel></rss>`,
      ),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("says nothing when the feed carries no version at all", async () => {
    mockMacFs(
      { "/Applications": ["Transmit.app"] },
      {
        [TRANSMIT_PLIST]: {
          SUFeedURL: "https://www.panic.com/updates/transmit5.xml",
          CFBundleShortVersionString: "5.10.3",
        },
      },
    );
    fetchMock.mockResolvedValue(
      xmlResponse(`<rss><channel><title>empty</title></channel></rss>`),
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("dedupes by bundle name — the first directory listed wins", async () => {
    mockMacFs(
      {
        "/Applications": ["Shadowed.app"],
        "/Applications/Utilities": [],
        "/home/u/Applications": ["Shadowed.app"],
      },
      { "/Applications/Shadowed.app/Contents/Info.plist": {} },
    );
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(
      "plutil",
      expect.arrayContaining(["/Applications/Shadowed.app/Contents/Info.plist"]),
    );
  });

  it("skips the home directory when homedir is unresolvable", async () => {
    homedirMock.mockImplementation(() => {
      throw new Error("no passwd entry");
    });
    mockMacFs({ "/home/u/Applications": ["Ghost.app"] }, {});
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(readdirMock).not.toHaveBeenCalled();
  });

  it("skips the home directory when homedir answers with an empty string", async () => {
    homedirMock.mockReturnValue("");
    mockMacFs({ "/home/u/Applications": ["Ghost.app"] }, {});
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(readdirMock).not.toHaveBeenCalled();
  });

  it("keeps scanning when the plist probe itself throws", async () => {
    readdirMock.mockImplementation(async (p: unknown) =>
      p === "/Applications" ? ["Weird.app"] : [],
    );
    existsSyncMock.mockImplementation((p: unknown) => {
      if (String(p).endsWith("/Contents/Info.plist")) throw new Error("EIO");
      return String(p) === "/Applications";
    });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("does not walk a directory that does not exist", async () => {
    mockMacFs({}, {});
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(readdirMock).not.toHaveBeenCalled();
  });

  it("survives an unreadable directory", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirMock.mockRejectedValue(new Error("EPERM"));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips a bundle with no Info.plist", async () => {
    mockMacFs({ "/Applications": ["Empty.app"] }, {});
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("keeps scanning when one bundle's plutil call rejects", async () => {
    mockMacFs(
      { "/Applications": ["Weird.app"] },
      { "/Applications/Weird.app/Contents/Info.plist": {} },
    );
    runMock.mockRejectedValue(new Error("runner: refusing to spawn"));
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });

  it("caps the walk at 200 bundles", async () => {
    const entries = Array.from({ length: 250 }, (_, i) => `App${i}.app`);
    const plists: PlistTable = {};
    for (const entry of entries) plists[`/Applications/${entry}/Contents/Info.plist`] = {};
    mockMacFs({ "/Applications": entries }, plists);
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(200);
  });

  it("returns [] rather than throwing when the walk itself blows up", async () => {
    existsSyncMock.mockImplementation(() => {
      throw new Error("EIO");
    });
    // `readAppEntries` swallows this one, so force the failure past it.
    readdirMock.mockImplementation(() => {
      throw new Error("EIO");
    });
    await expect(new SparkleProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("SparkleProvider updates", () => {
  it("never drives someone else's in-app updater", async () => {
    const res = await new SparkleProvider().update("Transmit");
    expect(res).toMatchObject({ id: "Transmit", success: false, skipped: true });
    expect(res.message).toContain("Transmit");
    expect(res.message).toMatch(/Check for Updates/);
    expect(runMock).not.toHaveBeenCalled();
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("does nothing for an empty set", async () => {
    await expect(new SparkleProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("skips every row of a non-empty set", async () => {
    const res = await new SparkleProvider().updateAll([row("Transmit"), row("iTerm")]);
    expect(res.map((o) => o.id)).toEqual(["Transmit", "iTerm"]);
    expect(res.every((o) => o.skipped === true && o.success === false)).toBe(true);
  });
});

describe("parseAppcastVersions", () => {
  it("reads the element shape", () => {
    expect(parseAppcastVersions(APPCAST_ELEMENT_SHAPE)).toEqual({
      short: "5.10.4",
      build: "5104",
    });
  });

  it("reads the enclosure-attribute shape", () => {
    expect(parseAppcastVersions(APPCAST_ATTRIBUTE_SHAPE)).toEqual({
      short: "3.5.14",
      build: "3.5.14",
    });
  });

  it("is null on blank and garbage input", () => {
    expect(parseAppcastVersions("")).toBeNull();
    expect(parseAppcastVersions("not xml at all")).toBeNull();
    expect(parseAppcastVersions("<rss><channel></channel></rss>")).toBeNull();
  });

  it("compares items instead of trusting document order", () => {
    const ascending = `<rss><channel>
      <item><sparkle:shortVersionString>1.0.0</sparkle:shortVersionString></item>
      <item><sparkle:shortVersionString>1.10.0</sparkle:shortVersionString></item>
      <item><sparkle:shortVersionString>1.9.0</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(ascending)).toEqual({ short: "1.10.0" });
  });

  it("skips items gated behind a sparkle:channel", () => {
    const withBeta = `<rss><channel>
      <item>
        <sparkle:channel>beta</sparkle:channel>
        <sparkle:shortVersionString>6.0.0</sparkle:shortVersionString>
      </item>
      <item><sparkle:shortVersionString>5.10.4</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(withBeta)).toEqual({ short: "5.10.4" });
  });

  it("unwraps CDATA", () => {
    const cdata = `<rss><channel><item>
      <sparkle:shortVersionString><![CDATA[2.5.1]]></sparkle:shortVersionString>
    </item></channel></rss>`;
    expect(parseAppcastVersions(cdata)).toEqual({ short: "2.5.1" });
  });

  it("refuses a capture that is markup rather than a version", () => {
    const markup = `<rss><channel><item>
      <sparkle:version><b>1</b></sparkle:version>
      <sparkle:shortVersionString></sparkle:shortVersionString>
    </item></channel></rss>`;
    expect(parseAppcastVersions(markup)).toBeNull();
  });

  it("never mistakes a sibling element for an item", () => {
    const sibling = `<rss><channel>
      <itemcount>3</itemcount>
      <item><sparkle:shortVersionString>1.2.3</sparkle:shortVersionString></item>
    </channel></rss>`;
    expect(parseAppcastVersions(sibling)).toEqual({ short: "1.2.3" });
  });

  it("stops at an unclosed item instead of spinning", () => {
    expect(parseAppcastVersions("<item><item><item".repeat(500))).toBeNull();
  });

  it("orders build-only items against each other", () => {
    const builds = `<rss><channel>
      <item><sparkle:version>5103</sparkle:version></item>
      <item><sparkle:version>5104</sparkle:version></item>
    </channel></rss>`;
    expect(parseAppcastVersions(builds)).toEqual({ build: "5104" });
  });

  it("keeps the first item when two items share no comparable flavour", () => {
    const mixed = `<rss><channel>
      <item><sparkle:shortVersionString>1.0.0</sparkle:shortVersionString></item>
      <item><sparkle:version>9999</sparkle:version></item>
    </channel></rss>`;
    expect(parseAppcastVersions(mixed)).toEqual({ short: "1.0.0" });
  });

  it("stops reading after 200 items", () => {
    const items = Array.from(
      { length: 205 },
      (_, i) =>
        `<item><sparkle:shortVersionString>1.0.${i + 1}</sparkle:shortVersionString></item>`,
    ).join("");
    expect(parseAppcastVersions(`<rss><channel>${items}</channel></rss>`)).toEqual({
      short: "1.0.200",
    });
  });
});

describe("sparkle compareVersions", () => {
  it("sorts 1.10 above 1.9", () => {
    expect(compareSparkleVersions("1.10", "1.9")).toBe(1);
    expect(compareSparkleVersions("1.9", "1.10")).toBe(-1);
  });

  it("treats every separator alike and ignores a pre-release suffix", () => {
    expect(compareSparkleVersions("v2.1", "2_1")).toBe(0);
    expect(compareSparkleVersions("2.0-beta1", "2.0")).toBe(0);
    expect(compareSparkleVersions("2.0+build9", "2.0")).toBe(0);
  });

  it("pads missing components with zero", () => {
    expect(compareSparkleVersions("5.10", "5.10.0")).toBe(0);
    expect(compareSparkleVersions("5.10.1", "5.10")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fink
// ---------------------------------------------------------------------------

/** `fink list --tab --outdated` — status, name, version, description. */
const FINK_OUTDATED_TAB = [
  "(i)\tgettext\t0.22.5-1\tMessage localization support",
  "(i)\tlibiconv\t1.17-1\tCharacter set conversion library",
].join("\n");

describe("FinkProvider", () => {
  it("is macOS-only and never probes fink elsewhere", async () => {
    commandExistsMock.mockResolvedValue(true);
    setPlatform("linux");
    await expect(new FinkProvider().isAvailable()).resolves.toBe(false);
    setPlatform("win32");
    await expect(new FinkProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();

    setPlatform("darwin");
    await expect(new FinkProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("fink");
  });

  it("aggregates the outdated set into one row, under a wall-clock cap", async () => {
    runMock.mockResolvedValueOnce(mkRun(FINK_OUTDATED_TAB));
    const rows = await new FinkProvider().listOutdated();
    expect(runMock).toHaveBeenCalledWith("fink", ["list", "--tab", "--outdated"], {
      timeout: 60_000,
    });
    expect(rows).toEqual([
      {
        id: "fink",
        name: "Fink (paquets installés)",
        current: "?",
        latest: "2 pkg",
        note: "sudo fink --yes update-all — d'après le dernier fink selfupdate",
      },
    ]);
  });

  it("returns [] when fink fails or times out", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FinkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when nothing is outdated", async () => {
    runMock.mockResolvedValueOnce(mkRun("\n"));
    await expect(new FinkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("goes through sudo for the whole-tree update", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FinkProvider().update("fink");
    expect(runInheritMock).toHaveBeenCalledWith("sudo", [
      "fink",
      "--yes",
      "update-all",
    ]);
    expect(res).toEqual({ id: "fink", success: true });
  });

  it("reports a failed update-all", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FinkProvider().update("fink")).resolves.toEqual({
      id: "fink",
      success: false,
    });
  });

  it("does nothing for an empty set", async () => {
    await expect(new FinkProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("runs update-all once and maps the outcome onto every row", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new FinkProvider().updateAll([row("fink"), row("other")]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual([
      { id: "fink", success: false },
      { id: "other", success: false },
    ]);
  });
});

describe("parseFinkOutdated", () => {
  it("reads the tab-delimited shape", () => {
    expect(parseFinkOutdated(FINK_OUTDATED_TAB)).toEqual(["gettext", "libiconv"]);
  });

  it("reads the space-padded table shape", () => {
    const padded = [
      "(i) gettext                        0.22.5-1        Message localization support",
      "    xz                             5.4.4-1         Compression utility",
    ].join("\r\n");
    expect(parseFinkOutdated(padded)).toEqual(["gettext", "xz"]);
  });

  it("accepts every status glyph do_real_list can print", () => {
    const stdout = [
      "i\tbash\t5.2.15-1\tGNU shell",
      "(i)\tgettext\t0.22.5-1\tMessage localization support",
      "*i*\tperl\t5.34.1-1\tPractical Extraction and Report Language",
      "\tcurl\t8.5.0-1\tData transfer tool",
    ].join("\n");
    expect(parseFinkOutdated(stdout)).toEqual(["bash", "gettext", "perl", "curl"]);
  });

  it("accepts an epoch-prefixed dpkg version", () => {
    expect(parseFinkOutdated("(i)\tsystem-perl\t2:5.34.1-1\tPerl")).toEqual([
      "system-perl",
    ]);
  });

  it("exempts a virtual package from the version column", () => {
    expect(parseFinkOutdated("p\tsystem-java\t\tVirtual package")).toEqual([
      "system-java",
    ]);
  });

  it("refuses a wrapped prose line that cleared the blank status glyph", () => {
    expect(parseFinkOutdated("   the following packages will be installed")).toEqual([]);
  });

  it("refuses an unknown status glyph, a bad name and a bad version", () => {
    const stdout = [
      "Information about 12345 packages read in 1 seconds.",
      "!!!\tgettext\t0.22.5-1\tbad flag",
      "(i)\t-gettext\t0.22.5-1\tbad name",
      "(i)\tgettext\tunstable\tbad version",
    ].join("\n");
    expect(parseFinkOutdated(stdout)).toEqual([]);
  });

  it("ignores blank input, blank lines and truncated rows", () => {
    expect(parseFinkOutdated("")).toEqual([]);
    expect(parseFinkOutdated("\n\n   \n")).toEqual([]);
    expect(parseFinkOutdated("ab")).toEqual([]);
    expect(parseFinkOutdated("(i)\tgettext")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pkgin
// ---------------------------------------------------------------------------

/** `pkgin list` — one installed package per line, name-version then comment. */
const PKGIN_LIST = [
  "bash-5.2.15 The GNU Bourne Again Shell",
  "nginx-1.24.0 Highly performant web server",
  "php-8.1.0 PHP Hypertext Preprocessor version 8.1",
].join("\n");

/** `pkgin -l "<" list` — remote builds that outrank the installed one. */
const PKGIN_LESSER = [
  "nginx-1.26.2 <    Highly performant web server",
  "php-8.2.20 <      PHP Hypertext Preprocessor version 8.2",
  "php-8.3.1 <       PHP Hypertext Preprocessor version 8.3",
  "unbound-1.19.0 <  DNS resolver",
].join("\n");

const PKGIN_SCAN_OPTIONS = { timeout: 60_000 };

describe("PkginProvider.isAvailable", () => {
  it("never probes pkgin on Windows", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new PkginProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("follows commandExists elsewhere", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PkginProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("pkgin");

    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PkginProvider().isAvailable()).resolves.toBe(false);
  });

  it("degrades to false when the probe throws", async () => {
    setPlatform("linux");
    commandExistsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(new PkginProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("PkginProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("darwin");
  });

  it("joins the installed listing with the upgradable one", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(PKGIN_LIST))
      .mockResolvedValueOnce(mkRun(PKGIN_LESSER));

    const rows = await new PkginProvider().listOutdated();

    expect(runMock).toHaveBeenNthCalledWith(1, "pkgin", ["list"], PKGIN_SCAN_OPTIONS);
    expect(runMock).toHaveBeenNthCalledWith(
      2,
      "pkgin",
      ["-l", "<", "list"],
      PKGIN_SCAN_OPTIONS,
    );
    expect(rows).toEqual([
      { id: "nginx", name: "nginx", current: "1.24.0", latest: "1.26.2" },
      {
        id: "php",
        name: "php",
        current: "8.1.0",
        latest: "8.3.1",
        note: "2 candidates — preferred.conf peut en imposer une autre",
      },
    ]);
  });

  it("returns [] when the installed listing fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when nothing is installed", async () => {
    runMock.mockResolvedValueOnce(mkRun("\n  \n"));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the `<` query fails", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(PKGIN_LIST))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] rather than throwing when the runner rejects", async () => {
    runMock.mockRejectedValueOnce(new Error("spawn ENOENT"));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
  });

  it("stays silent when the catalogue confirms everything is current", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(PKGIN_LIST))
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("bash-5.2.15 =    The GNU Bourne Again Shell"));

    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).toHaveBeenNthCalledWith(
      3,
      "pkgin",
      ["-l", "=", "list"],
      PKGIN_SCAN_OPTIONS,
    );
  });

  it("emits the refresh row when the remote catalogue is empty", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(PKGIN_LIST))
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun(""));

    await expect(new PkginProvider().listOutdated()).resolves.toEqual([
      {
        id: "pkgin:refresh",
        name: "pkgin (catalogue distant)",
        current: "?",
        latest: "refresh",
        note: "catalogue distant vide — sudo pkgin -y upgrade le reconstruit",
      },
    ]);
  });

  it("degrades to silence, not to a false alarm, when the `=` probe fails", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(PKGIN_LIST))
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new PkginProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("PkginProvider updates", () => {
  beforeEach(() => {
    setPlatform("darwin");
    setGetuid(() => 501);
  });

  it("installs one package through sudo when not root", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PkginProvider().update("nginx");
    expect(runInheritMock).toHaveBeenCalledWith("sudo", [
      "pkgin",
      "-y",
      "install",
      "nginx",
    ]);
    expect(res).toEqual({ id: "nginx", success: true });
  });

  it("skips sudo when the process already is root", async () => {
    setGetuid(() => 0);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new PkginProvider().update("nginx");
    expect(runInheritMock).toHaveBeenCalledWith("pkgin", ["-y", "install", "nginx"]);
  });

  it("falls back to sudo when getuid does not exist", async () => {
    setGetuid(undefined);
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new PkginProvider().update("nginx");
    expect(runInheritMock).toHaveBeenCalledWith("sudo", [
      "pkgin",
      "-y",
      "install",
      "nginx",
    ]);
  });

  it("upgrades the whole tree for the refresh row", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PkginProvider().update("pkgin:refresh");
    expect(runInheritMock).toHaveBeenCalledWith("sudo", ["pkgin", "-y", "upgrade"]);
    expect(res).toEqual({ id: "pkgin:refresh", success: true });
  });

  it("reports a failed install", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PkginProvider().update("nginx")).resolves.toEqual({
      id: "nginx",
      success: false,
    });
  });

  it("turns a rejected spawn into a failed outcome", async () => {
    runInheritMock.mockRejectedValueOnce(new Error("refusing to spawn"));
    await expect(new PkginProvider().update("nginx ")).resolves.toEqual({
      id: "nginx ",
      success: false,
    });
  });

  it("does nothing for an empty set", async () => {
    await expect(new PkginProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("upgrades once when nothing is left pending", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    runMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PkginProvider().updateAll([row("nginx"), row("php")]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual([
      { id: "nginx", success: true },
      { id: "php", success: true },
    ]);
  });

  it("re-runs once when pkgin upgraded only the package tools", async () => {
    runInheritMock
      .mockResolvedValueOnce(mkRun(""))
      .mockResolvedValueOnce(mkRun("", true));
    runMock.mockResolvedValueOnce(mkRun("nginx-1.26.2 <    Highly performant web server"));

    const res = await new PkginProvider().updateAll([row("nginx")]);

    expect(runInheritMock).toHaveBeenCalledTimes(2);
    expect(runInheritMock).toHaveBeenNthCalledWith(2, "sudo", [
      "pkgin",
      "-y",
      "upgrade",
    ]);
    expect(res).toEqual([{ id: "nginx", success: false }]);
  });

  it("never re-checks after a failed first pass", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PkginProvider().updateAll([row("nginx")]);
    expect(runMock).not.toHaveBeenCalled();
    expect(res).toEqual([{ id: "nginx", success: false }]);
  });

  it("treats a failed re-check as 'nothing pending'", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    runMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PkginProvider().updateAll([row("nginx")]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual([{ id: "nginx", success: true }]);
  });
});

describe("pkgin parsers", () => {
  it("parsePkginList splits a pkgsrc full name on its last dash", () => {
    const installed = parsePkginList(
      [
        "mysql-server-5.6.1nb2 MySQL 5.6, a free SQL database (server)",
        "py311-setuptools-63.1.0 New Python packaging system",
      ].join("\n"),
    );
    expect(installed.get("mysql-server")).toBe("5.6.1nb2");
    expect(installed.get("py311-setuptools")).toBe("63.1.0");
  });

  it("parsePkginList drops anything that is not a package line", () => {
    const installed = parsePkginList(
      [
        "",
        "   ",
        "empty local package list.",
        "-1.0",
        "nodash",
        "reading-local-summary",
      ].join("\n"),
    );
    expect(installed.size).toBe(0);
  });

  it("parseUpgradeCandidates keeps only the `<` rows", () => {
    expect(parseUpgradeCandidates(PKGIN_LESSER).map((e) => e.name)).toEqual([
      "nginx",
      "php",
      "php",
      "unbound",
    ]);
  });

  it("parseUpgradeCandidates ignores other status flags and headers", () => {
    const stdout = [
      "bash-5.2.15 =    The GNU Bourne Again Shell",
      "cvs-1.12.13 >    Concurrent Versions System",
      "reading local summary...",
      "",
    ].join("\n");
    expect(parseUpgradeCandidates(stdout)).toEqual([]);
  });

  it("parseUpgradeCandidates accepts the semicolon-separated form", () => {
    expect(
      parseUpgradeCandidates("nginx-1.26.2;<;Highly performant web server"),
    ).toEqual([{ name: "nginx", version: "1.26.2" }]);
  });

  it("parseUpgradeCandidates drops a flagged row whose first token is no package", () => {
    expect(parseUpgradeCandidates("notapackage <   a description")).toEqual([]);
  });

  it("parsePkginOutdated keeps the highest of several candidates", () => {
    const rows = parsePkginOutdated(PKGIN_LIST, PKGIN_LESSER);
    expect(rows.map((r) => r.id)).toEqual(["nginx", "php"]);
    expect(rows[1]).toMatchObject({ current: "8.1.0", latest: "8.3.1" });
  });

  it("parsePkginOutdated orders 1.10 above 1.9 when picking a candidate", () => {
    const rows = parsePkginOutdated(
      "foo-1.8 A package",
      ["foo-1.10 <   A package", "foo-1.9 <    A package"].join("\n"),
    );
    expect(rows).toEqual([
      {
        id: "foo",
        name: "foo",
        current: "1.8",
        latest: "1.10",
        note: "2 candidates — preferred.conf peut en imposer une autre",
      },
    ]);
  });

  it("parsePkginOutdated ranks a release above its own release candidate", () => {
    const rows = parsePkginOutdated(
      "foo-1.9 A package",
      ["foo-2.0rc1 <  A package", "foo-2.0 <     A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("2.0");
  });

  it("parsePkginOutdated ranks a longer version vector above its prefix", () => {
    const rows = parsePkginOutdated(
      "foo-1.9 A package",
      ["foo-1.10 <    A package", "foo-1.10.1 <  A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("1.10.1");
  });

  it("parsePkginOutdated reads PKGREVISION as an extra component, not a rank", () => {
    const rows = parsePkginOutdated(
      "foo-1.0 A package",
      ["foo-1.0nb2 <  A package", "foo-1.0nb1 <  A package"].join("\n"),
    );
    expect(rows[0]?.latest).toBe("1.0nb2");
  });

  it("parsePkginOutdated keeps the first of two identical candidates", () => {
    const rows = parsePkginOutdated(
      "foo-1.0 A package",
      ["foo-2.0 <  A package", "foo-2.0 <  A package"].join("\n"),
    );
    expect(rows).toEqual([
      {
        id: "foo",
        name: "foo",
        current: "1.0",
        latest: "2.0",
        note: "2 candidates — preferred.conf peut en imposer une autre",
      },
    ]);
  });

  it("parsePkginOutdated drops a candidate equal to the installed build", () => {
    expect(parsePkginOutdated(PKGIN_LIST, "nginx-1.24.0 <  Web server")).toEqual([]);
  });

  it("parsePkginOutdated ignores a candidate that is not installed", () => {
    expect(parsePkginOutdated(PKGIN_LIST, "unbound-1.19.0 <  DNS resolver")).toEqual([]);
  });

  it("parsePkginOutdated is empty on blank input", () => {
    expect(parsePkginOutdated("", "")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pkgx
// ---------------------------------------------------------------------------

describe("PkgxProvider.isAvailable", () => {
  it("never probes pkgx on Windows", async () => {
    setPlatform("win32");
    commandExistsMock.mockResolvedValue(true);
    await expect(new PkgxProvider().isAvailable()).resolves.toBe(false);
    expect(commandExistsMock).not.toHaveBeenCalled();
  });

  it("follows commandExists on POSIX", async () => {
    setPlatform("darwin");
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PkgxProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenCalledWith("pkgx");

    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PkgxProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("PkgxProvider.listOutdated", () => {
  beforeEach(() => {
    setPlatform("darwin");
  });

  it("reports a row carrying the detected install source", async () => {
    runMock.mockResolvedValueOnce(mkRun("pkgx 2.10.3\n"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("2.11.0");
    detectInstallSourceMock.mockResolvedValueOnce("brew");
    describeSourceMock.mockReturnValueOnce("via brew");

    const rows = await new PkgxProvider().listOutdated();

    expect(runMock).toHaveBeenCalledWith("pkgx", ["--version"]);
    expect(fetchGitHubReleaseTagMatchingMock).toHaveBeenCalledWith(
      "pkgxdev/pkgx",
      expect.any(Function),
    );
    expect(detectInstallSourceMock).toHaveBeenCalledWith("pkgx");
    expect(rows).toEqual([
      {
        id: "pkgx",
        name: "pkgx",
        current: "2.10.3",
        latest: "2.11.0",
        note: "via brew",
      },
    ]);
  });

  it("asks for the newest stable release on the installed major line", async () => {
    runMock.mockResolvedValueOnce(mkRun("pkgx 2.10.3\n"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce(null);
    await new PkgxProvider().listOutdated();

    const predicate = fetchGitHubReleaseTagMatchingMock.mock.calls[0]?.[1] as (
      tag: string,
    ) => boolean;
    expect(predicate("v2.11.0")).toBe(true);
    expect(predicate("2.11")).toBe(true);
    // The out-of-order v1 maintenance line must never win.
    expect(predicate("v1.6.0")).toBe(false);
    // A pre-release no delegated upgrade can install.
    expect(predicate("v2.12.0-rc.1")).toBe(false);
    // A non-version tag must not be read as major 0.
    expect(predicate("nightly")).toBe(false);
  });

  it("returns [] when the probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseTagMatchingMock).not.toHaveBeenCalled();
  });

  it("returns [] when the output is not a pkgx version line", async () => {
    runMock.mockResolvedValueOnce(mkRun("bash: pkgx: command not found"));
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseTagMatchingMock).not.toHaveBeenCalled();
  });

  it("returns [] when the release lookup finds nothing", async () => {
    runMock.mockResolvedValueOnce(mkRun("pkgx 2.11.0"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce(null);
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
    expect(detectInstallSourceMock).not.toHaveBeenCalled();
  });

  it("returns [] when the two spellings of the same release differ textually", async () => {
    runMock.mockResolvedValueOnce(mkRun("pkgx 2.11.0"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("2.11");
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when the feed answers with an older release", async () => {
    runMock.mockResolvedValueOnce(mkRun("pkgx 2.11.0"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("2.10.3");
    await expect(new PkgxProvider().listOutdated()).resolves.toEqual([]);
  });
});

describe("PkgxProvider updates", () => {
  it("delegates to whoever owns the binary, with the installer as fallback", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pkgx", success: true });
    const res = await new PkgxProvider().update("pkgx");
    expect(res).toEqual({ id: "pkgx", success: true });
    expect(delegateUpdateMock).toHaveBeenCalledWith({
      id: "pkgx",
      binary: "pkgx",
      packageIds: { brew: "pkgx" },
      manualMessage: expect.stringContaining("https://pkgx.sh | sh"),
    });
  });

  it("propagates a delegated failure", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pkgx", success: false });
    await expect(new PkgxProvider().update("whatever")).resolves.toEqual({
      id: "pkgx",
      success: false,
    });
  });

  it("does nothing for an empty set", async () => {
    await expect(new PkgxProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("collapses a non-empty set into a single delegated upgrade", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "pkgx", success: true });
    const res = await new PkgxProvider().updateAll([row("pkgx")]);
    expect(res).toEqual([{ id: "pkgx", success: true }]);
    expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe("pkgx parsers", () => {
  it("parsePkgxVersion reads the single-line output", () => {
    expect(parsePkgxVersion("pkgx 2.11.0\n")).toBe("2.11.0");
    expect(parsePkgxVersion("  pkgx v2.11.0")).toBe("2.11.0");
    expect(parsePkgxVersion("pkgx 2.12.0-rc.1")).toBe("2.12.0-rc.1");
  });

  it("parsePkgxVersion anchors on a line start, never on a passing mention", () => {
    expect(parsePkgxVersion("warning: pkgx 9.9.9 is stale\npkgx 2.11.0")).toBe("2.11.0");
  });

  it("parsePkgxVersion is null on blank, garbage and a foreign binary", () => {
    expect(parsePkgxVersion("")).toBeNull();
    expect(parsePkgxVersion("???")).toBeNull();
    expect(parsePkgxVersion("pkgx version unknown")).toBeNull();
  });

  it("compareVersions sorts 1.10 above 1.9", () => {
    expect(comparePkgxVersions("1.10.0", "1.9.0")).toBe(1);
    expect(comparePkgxVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  it("compareVersions treats 2.11 and 2.11.0 as the same release", () => {
    expect(comparePkgxVersions("2.11", "2.11.0")).toBe(0);
    expect(comparePkgxVersions("2.11.1", "2.11")).toBe(1);
    expect(comparePkgxVersions("2.11", "2.11.1")).toBe(-1);
  });

  it("compareVersions ranks a pre-release below its release, build metadata aside", () => {
    expect(comparePkgxVersions("2.12.0-rc.1", "2.12.0")).toBe(-1);
    expect(comparePkgxVersions("2.12.0", "2.12.0-rc.1")).toBe(1);
    expect(comparePkgxVersions("2.11.0+ci7", "2.11.0")).toBe(0);
    expect(comparePkgxVersions("2.12.0-rc.1", "2.12.0-rc.2")).toBe(0);
  });

  it("compareVersions maps an unparsable segment to zero", () => {
    expect(comparePkgxVersions("2.x", "2.0")).toBe(0);
  });
});
