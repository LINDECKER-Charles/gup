import { describe, expect, it, vi } from "vitest";
import * as runner from "../../../src/core/runner.js";
import {
  type ChannelVersions,
  outdatedRow,
  parseChannelVersions,
  parseVswhereInstances,
  VisualStudioProvider,
  vsInstallerOutcome,
} from "../../../src/providers/ide/visual-studio.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, installs, probeArgvs } from "../../support/system/trace.js";
import {
  BUILDTOOLS_PATH,
  channelManifest,
  channelRoute,
  COMMUNITY_PATH,
  setupUpdateArgv,
  STABLE_CHANNEL,
  VS_2022_CHANNEL,
  VS_INSTALLER_DIR,
  vsInstance,
  vsMachine,
  VSWHERE_ARGV,
  VSWHERE_EXE,
} from "./visual-studio.cases.js";

/**
 * Visual Studio's own knowledge: where the installer lives, how vswhere and
 * the channel manifests are read (two version scales, one product line), and
 * the installer's documented exit codes.
 */

const provider = () => new VisualStudioProvider();
const RESCAN = "Instance Visual Studio introuvable — relancer le scan.";

describe("VisualStudioProvider.isAvailable", () => {
  it.each(["darwin", "linux"] as const)("never looks at the disk on %s", async (platform) => {
    await system.load({ platform, env: { "ProgramFiles(x86)": "C:\\Program Files (x86)" } });
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });

  it("is unavailable, looking at nothing, when no %ProgramFiles% is exported", async () => {
    await system.load(vsMachine({ instances: [] }));
    delete process.env["ProgramFiles(x86)"];
    delete process.env["ProgramFiles"];
    await expect(provider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([]);
  });

  it("is unavailable when the installer directory holds no vswhere.exe", async () => {
    await system.load(vsMachine({ instances: [], files: [`${VS_INSTALLER_DIR}\\setup.exe`] }));
    await expect(provider().isAvailable()).resolves.toBe(false);
  });

  it("probes each distinct Program Files once, the x86 one first", async () => {
    const plain = "C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe";
    await system.load({ ...vsMachine({ instances: [], files: [plain] }) });
    await expect(provider().isAvailable()).resolves.toBe(true);
    expect(system.trace.fsReads).toEqual([VSWHERE_EXE, plain]);
  });
});

describe("parseVswhereInstances", () => {
  it("keeps entries carrying both an id and an install path", () => {
    const parsed = parseVswhereInstances(JSON.stringify([vsInstance()]));
    expect(parsed.map((instance) => instance.instanceId)).toEqual(["a1f2b3c4"]);
  });

  it("returns [] for a malformed JSON body rather than throwing", () => {
    expect(parseVswhereInstances("Not a valid vswhere payload")).toEqual([]);
    expect(parseVswhereInstances("")).toEqual([]);
    expect(parseVswhereInstances("[")).toEqual([]);
  });

  it("returns [] for the empty instance list vswhere prints on a clean box", () => {
    expect(parseVswhereInstances("[]")).toEqual([]);
  });

  it("returns [] when the payload is not an array", () => {
    expect(parseVswhereInstances(JSON.stringify({ instanceId: "x" }))).toEqual([]);
    expect(parseVswhereInstances("null")).toEqual([]);
  });

  it("drops null entries and entries missing an id or an install path", () => {
    const payload = JSON.stringify([
      null,
      "a string",
      { installationPath: COMMUNITY_PATH },
      { instanceId: "b1", installationPath: "" },
      { instanceId: "", installationPath: COMMUNITY_PATH },
      { instanceId: 42, installationPath: COMMUNITY_PATH },
      { instanceId: "ok", installationPath: COMMUNITY_PATH },
    ]);
    expect(parseVswhereInstances(payload).map((i) => i.instanceId)).toEqual(["ok"]);
  });
});

describe("parseChannelVersions", () => {
  it("reads both scales out of a Release manifest", () => {
    expect(parseChannelVersions(channelManifest())).toEqual({
      display: "17.14.9",
      build: "17.14.36301.6",
    });
  });

  it("strips the release-name suffix some manifests carry", () => {
    const manifest = { info: { productDisplayVersion: "17.14.37 (July 2026)" } };
    expect(parseChannelVersions(manifest)).toEqual({ display: "17.14.37", build: null });
  });

  it("strips a trailing dot rather than emitting an unusable version", () => {
    const manifest = { info: { productDisplayVersion: "17.14.9." } };
    expect(parseChannelVersions(manifest)?.display).toBe("17.14.9");
  });

  it("falls back to the product channel item when info carries no buildVersion", () => {
    expect(
      parseChannelVersions({
        info: { productDisplayVersion: "18.0.2" },
        channelItems: [
          null,
          { id: "Microsoft.VisualStudio.Manifests.Setup", version: "1.0.0" },
          { id: "Microsoft.VisualStudio.Product.Enterprise" },
          { version: "18.0.36000.1" },
          { id: "Microsoft.VisualStudio.Product.Community", version: "not-a-version" },
          { id: "Microsoft.VisualStudio.Product.Community", version: "18.0.36000.1" },
        ],
      }),
    ).toEqual({ display: "18.0.2", build: "18.0.36000.1" });
  });

  it("returns null when neither scale can be read", () => {
    expect(parseChannelVersions({})).toBeNull();
    expect(parseChannelVersions({ info: {}, channelItems: [] })).toBeNull();
    expect(parseChannelVersions({ info: { productDisplayVersion: ".5" } })).toBeNull();
    expect(parseChannelVersions({ channelItems: "nope" })).toBeNull();
  });

  it("returns null for anything that is not an object — the aka.ms search page case", () => {
    expect(parseChannelVersions(null)).toBeNull();
    expect(parseChannelVersions("<!DOCTYPE html>")).toBeNull();
    expect(parseChannelVersions(42)).toBeNull();
  });
});

describe("outdatedRow", () => {
  const channel: ChannelVersions = { display: "17.14.9", build: "17.14.36301.6" };

  it("emits an admin-gated row on the display scale", () => {
    expect(outdatedRow(vsInstance(), channel)).toEqual({
      id: "a1f2b3c4",
      name: "Visual Studio Community 2022",
      current: "17.14.7",
      latest: "17.14.9",
      note: "via l'installeur Visual Studio",
      requiresAdmin: true,
    });
  });

  it("falls back to the instance id when vswhere reports no display name", () => {
    expect(outdatedRow(vsInstance({ displayName: undefined }), channel)?.name).toBe("a1f2b3c4");
  });

  it("compares on the four-part build scale when the catalog is trimmed", () => {
    expect(outdatedRow(vsInstance({ catalog: undefined }), channel)).toMatchObject({
      current: "17.14.35931.197",
      latest: "17.14.36301.6",
    });
  });

  it("never mixes the scales — a display-less channel falls back to build", () => {
    // A manifest whose `info` is trimmed: only the Product channel item carries
    // a version. Pairing the instance's display version with it would compare
    // 17.14.7 with 17.14.36301.6.
    const row = outdatedRow(vsInstance(), { display: null, build: "17.14.36301.6" });
    expect(row).toMatchObject({ current: "17.14.35931.197", latest: "17.14.36301.6" });
  });

  it("drops Preview instances — they ride a channel we never read", () => {
    expect(outdatedRow(vsInstance({ isPrerelease: true }), channel)).toBeNull();
  });

  it("drops an instance with no id", () => {
    expect(outdatedRow(vsInstance({ instanceId: undefined }), channel)).toBeNull();
  });

  it("drops the row when neither scale lines up on both sides", () => {
    const bare = vsInstance({ catalog: undefined, installationVersion: undefined });
    expect(outdatedRow(bare, channel)).toBeNull();
    const trimmed = vsInstance({ catalog: undefined });
    expect(outdatedRow(trimmed, { display: "17.14.9", build: null })).toBeNull();
  });

  it("never compares two product lines", () => {
    expect(outdatedRow(vsInstance(), { display: "18.0.1", build: "18.0.36000.1" })).toBeNull();
  });

  it("drops a current version with no product line at all", () => {
    const instance = vsInstance({ catalog: { productDisplayVersion: "17" } });
    expect(outdatedRow(instance, { display: "17", build: null })).toBeNull();
  });

  it("stays silent when the channel is equal to or behind the instance", () => {
    expect(outdatedRow(vsInstance(), { display: "17.14.7", build: null })).toBeNull();
    expect(outdatedRow(vsInstance(), { display: "17.14.6", build: null })).toBeNull();
  });

  it("orders numerically — 17.14.10 is newer than 17.14.9, and 17.14 predates 17.14.1", () => {
    const at9 = vsInstance({ catalog: { productDisplayVersion: "17.14.9" } });
    expect(outdatedRow(at9, { display: "17.14.10", build: null })?.latest).toBe("17.14.10");
    const short = vsInstance({ catalog: { productDisplayVersion: "17.14" } });
    expect(outdatedRow(short, { display: "17.14.1", build: null })?.latest).toBe("17.14.1");
    expect(outdatedRow(at9, { display: "17.14", build: null })).toBeNull();
  });
});

describe("VisualStudioProvider.listOutdated", () => {
  it("gives the channel request a deadline, so aka.ms can never pin a scan slot", async () => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    const seen: (RequestInit | undefined)[] = [];
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
      seen.push(init);
      return system.fetch(input, init);
    });
    await provider().listOutdated();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.headers).toEqual({ accept: "application/json" });
  });

  it("fetches one manifest per product line, whatever the instance count", async () => {
    const buildTools = vsInstance({
      instanceId: "d4c3b2a1",
      displayName: "Visual Studio Build Tools 2022",
      installationPath: BUILDTOOLS_PATH,
    });
    const unversioned = vsInstance({
      instanceId: "no-version",
      installationVersion: undefined,
      catalog: undefined,
    });
    await system.load(vsMachine({ instances: [vsInstance(), buildTools, unversioned] }));
    const rows = await provider().listOutdated();
    expect(system.trace.requests).toHaveLength(1);
    expect(rows.map((row) => row.id)).toEqual(["a1f2b3c4", "d4c3b2a1"]);
    expect(rows.every((row) => row.requiresAdmin === true)).toBe(true);
  });

  it("reads VS 2026 and later through the `stable` moniker, not a per-major link", async () => {
    const at = (version: string, display: string) =>
      vsInstance({ instanceId: `vs${version}`, installationVersion: version, catalog: { productDisplayVersion: display } });
    const instances = [at("18.0.36000.1", "18.0.2")];
    const stable = channelRoute(STABLE_CHANNEL, { info: { productDisplayVersion: "18.0.3" } });
    await system.load(vsMachine({ instances, http: [stable] }));
    await expect(provider().listOutdated()).resolves.toMatchObject([
      { current: "18.0.2", latest: "18.0.3" },
    ]);
    const future = channelRoute(STABLE_CHANNEL, { info: { productDisplayVersion: "20.0.2" } });
    await system.load(vsMachine({ instances: [at("20.0.1.0", "20.0.1")], http: [future] }));
    await expect(provider().listOutdated()).resolves.toMatchObject([
      { current: "20.0.1", latest: "20.0.2" },
    ]);
  });

  it("issues one request per distinct product line, in instance order", async () => {
    const vs2019 = vsInstance({
      instanceId: "vs2019",
      displayName: "Visual Studio Professional 2019",
      installationVersion: "16.11.35.0",
      installationPath: "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional",
      catalog: { productDisplayVersion: "16.11.35" },
    });
    const vs16 = "https://aka.ms/vs/16/release/channel";
    const http = [
      channelRoute(VS_2022_CHANNEL),
      channelRoute(vs16, { info: { productDisplayVersion: "16.11.40" } }),
    ];
    await system.load(vsMachine({ instances: [vsInstance(), vs2019], http }));
    const rows = await provider().listOutdated();
    expect(system.trace.requests.map((request) => request.url)).toEqual([VS_2022_CHANNEL, vs16]);
    expect(rows.map((row) => [row.id, row.current, row.latest])).toEqual([
      ["a1f2b3c4", "17.14.7", "17.14.9"],
      ["vs2019", "16.11.35", "16.11.40"],
    ]);
  });

  it("stays silent when `stable` has already moved to the next major", async () => {
    const vs2026 = vsInstance({
      instanceId: "vs2026",
      installationVersion: "18.0.36000.1",
      catalog: { productDisplayVersion: "18.0.2" },
    });
    // `stable` serves VisualStudio.19.Release: the installer cannot move 18.x there.
    const moved = channelRoute(STABLE_CHANNEL, { info: { productDisplayVersion: "19.0.1" } });
    await system.load(vsMachine({ instances: [vs2026], http: [moved] }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
  });

  it("lists nothing, running and asking nothing, without vswhere", async () => {
    await system.load(vsMachine({ instances: [vsInstance()], files: [] }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("trusts nothing vswhere printed when it exited non-zero", async () => {
    const machine = vsMachine({ instances: [vsInstance()] });
    const failing = { argv: VSWHERE_ARGV, stdout: JSON.stringify([vsInstance()]), exitCode: 1 };
    await system.load({ ...machine, commands: [failing] });
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it.each([
    ["the runner refuses the spawn", { on: "spawn", argv: VSWHERE_ARGV, mode: "rejects" }],
    ["vswhere prints no JSON", { on: "spawn", argv: VSWHERE_ARGV, mode: "garbage" }],
  ] as const)("lists nothing, asking nothing, when %s", async (_label, fault) => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    system.inject(fault);
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("caches a failed lookup so one dead channel costs one request", async () => {
    const second = vsInstance({ instanceId: "second", installationPath: BUILDTOOLS_PATH });
    const dead = { ...channelRoute(VS_2022_CHANNEL), status: 500 };
    await system.load(vsMachine({ instances: [vsInstance(), second], http: [dead] }));
    await expect(provider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toHaveLength(1);
  });
});

describe("vsInstallerOutcome", () => {
  it("treats 0 as a plain success", () => {
    expect(vsInstallerOutcome("i1", 0)).toEqual({ id: "i1", success: true });
  });

  it("treats the reboot codes as successes", () => {
    for (const code of [3010, 1641]) {
      expect(vsInstallerOutcome("i1", code)).toEqual({
        id: "i1",
        success: true,
        message: "Mise à jour effectuée — redémarrer pour finaliser.",
      });
    }
  });

  it("treats elevation and cancellation as deferrals, not failures", () => {
    expect(vsInstallerOutcome("i1", 740)).toEqual({
      id: "i1",
      success: false,
      skipped: true,
      message: expect.stringContaining("droits administrateur"),
    });
    for (const code of [1602, 5004, -1073741510]) {
      expect(vsInstallerOutcome("i1", code)).toEqual({
        id: "i1",
        success: false,
        skipped: true,
        message: "Mise à jour annulée.",
      });
    }
  });

  it("maps the documented failure codes to actionable messages", () => {
    expect(vsInstallerOutcome("i1", 1001).message).toMatch(/tourne déjà/);
    expect(vsInstallerOutcome("i1", 1003).message).toMatch(/en cours d'utilisation/);
    expect(vsInstallerOutcome("i1", 1618).message).toMatch(/autre installation/);
    expect(vsInstallerOutcome("i1", 5007).message).toMatch(/prérequis/);
    expect(vsInstallerOutcome("i1", 8006).message).toMatch(/processus/);
    expect(vsInstallerOutcome("i1", 8010).message).toMatch(/Système d'exploitation/);
    expect(vsInstallerOutcome("i1", -1073720687).message).toMatch(/réseau/);
  });

  it("fails without a message for a code Microsoft never documented", () => {
    expect(vsInstallerOutcome("i1", 4242)).toEqual({ id: "i1", success: false });
  });
});

describe("VisualStudioProvider.update", () => {
  it("starts the installer from the temp directory, never from its own", async () => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    await provider().update("a1f2b3c4");
    expect(installs().map((spawn) => spawn.cwd)).toEqual(["C:\\Users\\u\\AppData\\Local\\Temp"]);
  });

  it("asks for a rescan when the instance id is unknown", async () => {
    await system.load(vsMachine({ instances: [] }));
    await expect(provider().update("ghost")).resolves.toEqual({
      id: "ghost",
      success: false,
      message: RESCAN,
    });
    expect(installArgvs()).toEqual([]);
  });

  it("asks for a rescan, running nothing, when the installer directory is gone", async () => {
    await system.load(vsMachine({ instances: [vsInstance()], files: [] }));
    await expect(provider().update("a1f2b3c4")).resolves.toMatchObject({ message: RESCAN });
    expect(probeArgvs()).toEqual([]);
    expect(installArgvs()).toEqual([]);
  });

  it("skips, without asking for elevation, when setup.exe is missing beside vswhere", async () => {
    await system.load(vsMachine({ instances: [vsInstance()], files: [VSWHERE_EXE] }));
    const elevation = replaceForTest(runner, "isElevated", () => Promise.resolve(true));
    const outcome = await provider().update("a1f2b3c4");
    expect(outcome).toMatchObject({ success: false, skipped: true });
    expect(outcome.message).toMatch(/Installeur Visual Studio introuvable/);
    expect(elevation).not.toHaveBeenCalled();
  });

  it("skips without elevation instead of spawning a doomed installer", async () => {
    await system.load(vsMachine({ instances: [vsInstance()], elevated: false }));
    const outcome = await provider().update("a1f2b3c4");
    expect(outcome).toMatchObject({ success: false, skipped: true });
    expect(outcome.message).toMatch(/droits administrateur/);
    expect(installArgvs()).toEqual([]);
  });

  it("reads a refusal to probe elevation as `not elevated`", async () => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    replaceForTest(runner, "isElevated", () => Promise.reject(new Error("whoami missing")));
    await expect(provider().update("a1f2b3c4")).resolves.toMatchObject({ skipped: true });
    expect(installArgvs()).toEqual([]);
  });

  it("reports a spawn refusal as a failure rather than throwing", async () => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    system.answerInstall({ rejects: true });
    const outcome = await provider().update("a1f2b3c4");
    expect(outcome).toMatchObject({ id: "a1f2b3c4", success: false });
    expect(outcome.message).toMatch(/Impossible de lancer l'installeur/);
    expect(outcome.skipped).toBeUndefined();
  });

  it("maps the installer's exit code through the documented table", async () => {
    await system.load(vsMachine({ instances: [vsInstance()] }));
    system.answerInstall({ exitCode: 1001 });
    const outcome = await provider().update("a1f2b3c4");
    expect(outcome).toMatchObject({ success: false });
    expect(outcome.message).toMatch(/tourne déjà/);
  });
});

describe("VisualStudioProvider.updateAll", () => {
  it("reads the inventory once and updates the instances one after the other", async () => {
    const buildTools = vsInstance({ instanceId: "d4c3b2a1", installationPath: BUILDTOOLS_PATH });
    await system.load(vsMachine({ instances: [vsInstance(), buildTools] }));
    system.answerInstall({ exitCode: 0 }, { exitCode: 3010 });
    const rows = ["a1f2b3c4", "d4c3b2a1", "gone"].map((id) => ({
      id,
      current: "17.14.7",
      latest: "17.14.9",
    }));
    const outcomes = await provider().updateAll(rows);
    expect(probeArgvs().filter((argv) => argv[0] === VSWHERE_EXE)).toHaveLength(1);
    expect(installArgvs()).toEqual([
      setupUpdateArgv(COMMUNITY_PATH),
      setupUpdateArgv(BUILDTOOLS_PATH),
    ]);
    expect(outcomes).toEqual([
      { id: "a1f2b3c4", success: true },
      {
        id: "d4c3b2a1",
        success: true,
        message: "Mise à jour effectuée — redémarrer pour finaliser.",
      },
      { id: "gone", success: false, message: RESCAN },
    ]);
  });
});
