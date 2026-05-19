import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: vi.fn(),
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: vi.fn(),
  normalizeVersion: (v: string) => v.trim().replace(/^v/i, "").toLowerCase(),
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

const { admZipMock } = vi.hoisted(() => ({
  admZipMock: vi.fn(),
}));

vi.mock("adm-zip", () => ({
  default: admZipMock,
}));

import { EclipseMarketplaceProvider } from "../../src/providers/ide/eclipse-marketplace.js";
import { JetBrainsPluginsProvider } from "../../src/providers/ide/jetbrains-plugins.js";
import { NotepadPpProvider } from "../../src/providers/ide/notepad-pp.js";
import { ObsidianPluginsProvider } from "../../src/providers/ide/obsidian-plugins.js";
import { SublimePcProvider } from "../../src/providers/ide/sublime-pc.js";
import { UnityHubProvider } from "../../src/providers/ide/unity-hub.js";
import { ZedExtProvider } from "../../src/providers/ide/zed-ext.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_PLATFORM = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  existsSyncMock.mockReset();
  readFileMock.mockReset();
  readdirMock.mockReset();
  statMock.mockReset();
  admZipMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env["LOCALAPPDATA"] = "C:\\Users\\me\\AppData\\Local";
  process.env["APPDATA"] = "C:\\Users\\me\\AppData\\Roaming";
  process.env["USERPROFILE"] = "C:\\Users\\me";
  process.env["PROGRAMFILES"] = "C:\\Program Files";
  process.env["PROGRAMFILES(X86)"] = "C:\\Program Files (x86)";
  setPlatform("win32");
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  setPlatform(ORIGINAL_PLATFORM);
});

// ---------------------------------------------------------------------------
// EclipseMarketplaceProvider
// ---------------------------------------------------------------------------
describe("EclipseMarketplaceProvider", () => {
  it("isAvailable returns false when no eclipse home is found", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockReturnValue(false);
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable returns true when an eclipse home is found (direct)", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      // First "Eclipse Foundation" root exists; it also has features + plugins.
      return (
        p === "C:\\Program Files\\Eclipse Foundation" ||
        p === "C:\\Program Files\\Eclipse Foundation\\features" ||
        p === "C:\\Program Files\\Eclipse Foundation\\plugins"
      );
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(true);
  });

  it("isAvailable returns false when stat throws on a candidate", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation(
      (p: string) => p === "C:\\Program Files\\Eclipse Foundation",
    );
    statMock.mockRejectedValue(new Error("EACCES"));
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable returns false when stat result is not a directory", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation(
      (p: string) => p === "C:\\Program Files\\Eclipse Foundation",
    );
    statMock.mockResolvedValue({ isDirectory: () => false });
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable skips a root when features dir is missing but plugins dir exists", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\Eclipse Foundation") return true;
      if (p === "C:\\Program Files\\Eclipse Foundation\\features") return false;
      if (p === "C:\\Program Files\\Eclipse Foundation\\plugins") return true;
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockResolvedValue([]);
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable skips a root when plugins dir is missing but features dir exists", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\Eclipse Foundation") return true;
      if (p === "C:\\Program Files\\Eclipse Foundation\\features") return true;
      if (p === "C:\\Program Files\\Eclipse Foundation\\plugins") return false;
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockResolvedValue([]);
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable tolerates readdir throwing on a parent root", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation(
      (p: string) => p === "C:\\Program Files\\Eclipse Foundation",
    );
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockRejectedValue(new Error("EACCES"));
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("skips a root entirely when none of the env vars are set", async () => {
    delete process.env["PROGRAMFILES"];
    delete process.env["PROGRAMFILES(X86)"];
    delete process.env["LOCALAPPDATA"];
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockReturnValue(false);
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable returns false when nested children all fail checkEclipseHome", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\Eclipse Foundation") return true;
      // Root itself isn't a valid eclipse home (no features dir).
      if (p === "C:\\Program Files\\Eclipse Foundation\\features") return false;
      // The nested children also fail the existsSync(path) gate.
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockResolvedValueOnce(["bogus-child"]);
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("listOutdated returns [] when features dir disappears between checks", async () => {
    commandExistsMock.mockResolvedValue(false);
    let listCalled = false;
    existsSyncMock.mockImplementation((p: string) => {
      // For isAvailable's findEclipseHome → checkEclipseHome:
      // grant features+plugins existence so a home is found.
      if (p === "C:\\Program Files\\eclipse") return true;
      if (p === "C:\\Program Files\\eclipse\\plugins") return true;
      if (p === "C:\\Program Files\\eclipse\\features") {
        // Allow the first check (during findEclipseHome) but deny the
        // listOutdated's own existsSync(featuresDir).
        if (listCalled) return false;
        return true;
      }
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    const provider = new EclipseMarketplaceProvider();
    listCalled = true;
    await expect(provider.listOutdated()).resolves.toEqual([]);
  });

  it("isAvailable finds a nested eclipse home under a root", async () => {
    commandExistsMock.mockResolvedValue(true);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\Eclipse Foundation") return true;
      // Direct check: features missing
      if (p === "C:\\Program Files\\Eclipse Foundation\\features") return false;
      // Nested child:
      if (p === "C:\\Program Files\\Eclipse Foundation\\jee-2024-09") return true;
      if (
        p === "C:\\Program Files\\Eclipse Foundation\\jee-2024-09\\features"
      )
        return true;
      if (p === "C:\\Program Files\\Eclipse Foundation\\jee-2024-09\\plugins")
        return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      if (p === "C:\\Program Files\\Eclipse Foundation") return ["jee-2024-09"];
      return [];
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    await expect(
      new EclipseMarketplaceProvider().isAvailable(),
    ).resolves.toBe(true);
  });

  it("listOutdated returns [] when no eclipse home", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockReturnValue(false);
    await expect(
      new EclipseMarketplaceProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when features dir is missing", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\eclipse") return true;
      if (p === "C:\\Program Files\\eclipse\\features") return false;
      if (p === "C:\\Program Files\\eclipse\\plugins") return true;
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    await expect(
      new EclipseMarketplaceProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated parses feature dirs, drops org.eclipse.* and bad versions", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      // Treat "C:\\Program Files\\eclipse" as the eclipse home.
      if (p === "C:\\Program Files\\eclipse") return true;
      if (p === "C:\\Program Files\\eclipse\\features") return true;
      if (p === "C:\\Program Files\\eclipse\\plugins") return true;
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockImplementation(async (p: string) => {
      if (p === "C:\\Program Files\\eclipse\\features") {
        return [
          "com.foo.feature_1.2.3", // accepted
          "org.eclipse.platform_4.30.0", // skipped (org.eclipse.*)
          "nodelim", // no underscore
          "weird_notaversion", // unparseable version
          "another.feature_2.0", // accepted
        ];
      }
      return [];
    });

    const out = await new EclipseMarketplaceProvider().listOutdated();
    expect(out).toEqual([
      {
        id: "com.foo.feature",
        name: "com.foo.feature",
        current: "1.2.3",
        latest: "?",
        note: expect.any(String),
        manual: true,
      },
      {
        id: "another.feature",
        name: "another.feature",
        current: "2.0",
        latest: "?",
        note: expect.any(String),
        manual: true,
      },
    ]);
  });

  it("listOutdated returns [] when readdir on features throws", async () => {
    commandExistsMock.mockResolvedValue(false);
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Program Files\\eclipse") return true;
      if (p === "C:\\Program Files\\eclipse\\features") return true;
      if (p === "C:\\Program Files\\eclipse\\plugins") return true;
      return false;
    });
    statMock.mockResolvedValue({ isDirectory: () => true });
    readdirMock.mockRejectedValue(new Error("EACCES"));

    await expect(
      new EclipseMarketplaceProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("update returns skipped/manual outcome", async () => {
    const out = await new EclipseMarketplaceProvider().update("com.x");
    expect(out).toMatchObject({
      id: "com.x",
      success: false,
      skipped: true,
    });
  });

  it("updateAll returns one skipped entry per input", async () => {
    const out = await new EclipseMarketplaceProvider().updateAll([
      { id: "a" } as never,
      { id: "b" } as never,
    ]);
    expect(out).toHaveLength(2);
    for (const o of out) expect(o.skipped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JetBrainsPluginsProvider
// ---------------------------------------------------------------------------
describe("JetBrainsPluginsProvider", () => {
  it("isAvailable returns false when APPDATA is unset", async () => {
    delete process.env["APPDATA"];
    existsSyncMock.mockReturnValue(false);
    await expect(
      new JetBrainsPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable returns true when JetBrains config dir exists", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    await expect(
      new JetBrainsPluginsProvider().isAvailable(),
    ).resolves.toBe(true);
  });

  it("listOutdated returns [] when readdir on root throws", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    readdirMock.mockRejectedValue(new Error("EACCES"));
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when there are no IDE dirs", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    readdirMock.mockResolvedValue(["not-an-ide", "totallyinvalid"]);
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated parses a plugin dir manifest, filters platform plugins, and emits manual entry", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("webstorm2024.1\\plugins")) return true;
      if (
        lower.endsWith(
          "webstorm2024.1\\plugins\\my-plugin\\meta-inf\\plugin.xml",
        )
      )
        return true;
      if (
        lower.endsWith(
          "webstorm2024.1\\plugins\\platform-plugin\\meta-inf\\plugin.xml",
        )
      )
        return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["WebStorm2024.1"];
      if (lower.endsWith("webstorm2024.1\\plugins"))
        return ["my-plugin", "platform-plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({
      isDirectory: () => true,
    }));
    readFileMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.includes("my-plugin\\meta-inf\\plugin.xml")) {
        return `<idea-plugin><id>com.example.myplugin</id><name>MyPlugin</name><version>1.0.0</version><vendor>Acme</vendor></idea-plugin>`;
      }
      if (lower.includes("platform-plugin\\meta-inf\\plugin.xml")) {
        // Platform plugin — vendor JetBrains + NNN.NNN.NN version pattern.
        return `<idea-plugin><id>com.intellij.platform</id><name>Platform</name><version>241.10000.50</version><vendor>JetBrains</vendor></idea-plugin>`;
      }
      throw new Error("ENOENT");
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<plugin-repository><plugin><version>2.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out).toEqual([
      expect.objectContaining({
        id: "com.example.myplugin",
        name: "MyPlugin",
        current: "1.0.0",
        latest: "2.0.0",
        manual: true,
      }),
    ]);
  });

  it("listOutdated filters when latest <= current", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><id>foo</id><name>Foo</name><version>3.0.0</version><vendor>Other</vendor></idea-plugin>`,
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<plugin-repository><plugin><version>2.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated handles fetch failure (HTTP not ok)", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><id>foo</id><name>Foo</name><version>1.0.0</version><vendor>Other</vendor></idea-plugin>`,
    );
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => "",
    } as unknown as Response);

    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated handles fetch network error", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><id>foo</id><name>Foo</name><version>1.0.0</version><vendor>Other</vendor></idea-plugin>`,
    );
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated skips plugin dirs whose stat throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["badperm"];
      return [];
    });
    statMock.mockRejectedValue(new Error("EACCES"));
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated dedupes across IDE hosts and merges hosts list", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("webstorm2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains"))
        return ["IntelliJIdea2024.1", "WebStorm2024.1"];
      if (
        lower.endsWith("idea2024.1\\plugins") ||
        lower.endsWith("webstorm2024.1\\plugins")
      )
        return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    let counter = 0;
    readFileMock.mockImplementation(async () => {
      counter += 1;
      // Different versions across IDEs → exercise compareVersions branch.
      return `<idea-plugin><id>foo</id><name>Foo</name><version>${counter === 1 ? "2.0.0" : "1.0.0"}</version><vendor>Acme</vendor></idea-plugin>`;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<plugin-repository><plugin><version>3.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out).toHaveLength(1);
    // Note merges both IDE host short-names.
    expect(out[0]?.note?.split(", ").sort()).toEqual(["IDEA", "WebStorm"]);
    // Should report the older installed version.
    expect(out[0]?.current).toBe("1.0.0");
  });

  it("listOutdated parses plugin metadata from a top-level .jar via lib fallback", async () => {
    // We won't actually inflate a zip — instead exercise the branch that
    // skips plugin dirs missing META-INF/plugin.xml AND lib/. Expected result: [].
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin-no-meta"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));

    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated falls back to extracting from a JAR in lib/ when META-INF/plugin.xml is missing", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      // No META-INF/plugin.xml in the plugin dir.
      if (lower.endsWith("plugin-libonly\\meta-inf\\plugin.xml")) return false;
      if (lower.endsWith("plugin-libonly\\lib")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin-libonly"];
      if (lower.endsWith("plugin-libonly\\lib"))
        return ["plugin-1.0.0.jar", "README.txt"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    admZipMock.mockImplementation(function (this: object) {
      Object.assign(this, {
        getEntry: (name: string) => {
          if (name === "META-INF/plugin.xml") {
            return {
              getData: () =>
                Buffer.from(
                  `<idea-plugin><id>com.lib.plug</id><name>LibPlug</name><version>1.0.0</version><vendor>Third</vendor></idea-plugin>`,
                  "utf8",
                ),
            };
          }
          return null;
        },
      });
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<plugin-repository><plugin><version>2.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out).toEqual([
      expect.objectContaining({
        id: "com.lib.plug",
        current: "1.0.0",
        latest: "2.0.0",
        manual: true,
      }),
    ]);
  });

  it("returns null when AdmZip throws or entry is missing in JAR", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("bad\\lib")) return true;
      if (lower.endsWith("noentry\\lib")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["bad", "noentry"];
      if (lower.endsWith("bad\\lib")) return ["broken.jar"];
      if (lower.endsWith("noentry\\lib")) return ["empty.jar"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    let call = 0;
    admZipMock.mockImplementation(function (this: object) {
      call += 1;
      if (call === 1) throw new Error("invalid jar");
      Object.assign(this, { getEntry: () => null });
    });
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("returns null when readdir on lib/ throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\lib")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      if (lower.endsWith("plugin\\lib")) throw new Error("EACCES");
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("extracts metadata from a top-level .jar plugin file (not a dir)", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["solo.jar"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => false }));
    admZipMock.mockImplementation(function (this: object) {
      Object.assign(this, {
        getEntry: () => ({
          getData: () =>
            Buffer.from(
              `<idea-plugin><id>com.solo</id><name>Solo</name><version>1.0.0</version></idea-plugin>`,
              "utf8",
            ),
        }),
      });
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<plugin-repository><plugin><version>1.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);
    // Same versions → no outdated row, but the code path is exercised.
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("ignores plugin.xml without id or version", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    // Missing <id> element.
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><name>NoId</name><version>1.0.0</version></idea-plugin>`,
    );
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("treats meta-inf/plugin.xml read failure as no-metadata", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockRejectedValueOnce(new Error("EACCES"));
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("update returns skipped manual outcome", async () => {
    const out = await new JetBrainsPluginsProvider().update("foo");
    expect(out).toMatchObject({
      id: "foo",
      success: false,
      skipped: true,
    });
  });

  it("updateAll returns one skipped entry per input", async () => {
    const out = await new JetBrainsPluginsProvider().updateAll([
      { id: "a" } as never,
    ]);
    expect(out).toEqual([
      expect.objectContaining({ id: "a", skipped: true }),
    ]);
  });

  it("isAvailable returns false when APPDATA is not set (jetbrainsConfigRoot returns '')", async () => {
    delete process.env["APPDATA"];
    await expect(
      new JetBrainsPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("listOutdated returns [] when APPDATA is not set", async () => {
    delete process.env["APPDATA"];
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated skips IDE dirs whose plugins subdir is missing", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    readdirMock.mockResolvedValue(["IntelliJIdea2024.1"]);
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("skips entries that are neither directories nor .jar files", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["readme.txt"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => false }));
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("treats plugin.xml without <name> as falling back to id", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><id>noname.id</id><version>1.0.0</version><vendor>Acme</vendor></idea-plugin>`,
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<plugin-repository><plugin><version>2.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);
    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out[0]?.name).toBe("noname.id");
  });

  it("falls back to productDir as ideHost when product name does not match pattern", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    readdirMock.mockResolvedValue(["NotAnIde"]);
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("returns null when marketplace XML has no <version> element", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    readFileMock.mockResolvedValueOnce(
      `<idea-plugin><id>foo</id><name>Foo</name><version>1.0.0</version></idea-plugin>`,
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => "<empty/>",
    } as unknown as Response);
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("compareVersions handles versions of unequal segment counts", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("a\\meta-inf\\plugin.xml")) return true;
      if (lower.endsWith("b\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["a", "b"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    // Installed versions of unequal segment count to exercise both
    // `partsA[i] ?? 0` and `partsB[i] ?? 0` paths in compareVersions.
    readFileMock.mockImplementation(async (path: string) => {
      if (path.toLowerCase().endsWith("a\\meta-inf\\plugin.xml")) {
        return `<idea-plugin><id>p</id><name>P</name><version>1.0</version><vendor>Acme</vendor></idea-plugin>`;
      }
      if (path.toLowerCase().endsWith("b\\meta-inf\\plugin.xml")) {
        return `<idea-plugin><id>p</id><name>P</name><version>1.0.0.5</version><vendor>Acme</vendor></idea-plugin>`;
      }
      throw new Error("ENOENT");
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<plugin-repository><plugin><version>2.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out).toHaveLength(1);
    // The shorter version "1.0" wins (kept as the older installed version).
    expect(out[0]?.current).toBe("1.0");
  });

  it("shortenIdeName falls through to productDir when the regex doesn't match", async () => {
    // Insert a malformed IDE dir name and a well-formed one to mix paths.
    existsSyncMock.mockImplementation((p: string) => p.endsWith("JetBrains"));
    readdirMock.mockResolvedValue(["Notation_invalid"]);
    await expect(
      new JetBrainsPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("dedupes plugins where the existing host already covers the new one", async () => {
    // First scan finds plugin in IDEA, second scan in same IDEA dir — same
    // host string → existing.ideHosts.includes(host) === true → else branch.
    existsSyncMock.mockImplementation((p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return true;
      if (lower.endsWith("idea2024.1\\plugins")) return true;
      if (lower.endsWith("plugin\\meta-inf\\plugin.xml")) return true;
      if (lower.endsWith("plugin2\\meta-inf\\plugin.xml")) return true;
      return false;
    });
    readdirMock.mockImplementation(async (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith("jetbrains")) return ["IntelliJIdea2024.1"];
      if (lower.endsWith("idea2024.1\\plugins")) return ["plugin", "plugin2"];
      return [];
    });
    statMock.mockImplementation(async () => ({ isDirectory: () => true }));
    let n = 0;
    readFileMock.mockImplementation(async () => {
      n += 1;
      // Same id, different versions; same ideHost both times.
      return `<idea-plugin><id>dup</id><name>Dup</name><version>${n === 1 ? "1.0.0" : "2.0.0"}</version><vendor>Acme</vendor></idea-plugin>`;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<plugin-repository><plugin><version>3.0.0</version></plugin></plugin-repository>`,
    } as unknown as Response);

    const out = await new JetBrainsPluginsProvider().listOutdated();
    expect(out).toHaveLength(1);
    // Older version (1.0.0) wins because we keep the lowest.
    expect(out[0]?.current).toBe("1.0.0");
    // Single ideHost (deduped).
    expect(out[0]?.note).toBe("IDEA");
  });
});

// ---------------------------------------------------------------------------
// NotepadPpProvider
// ---------------------------------------------------------------------------
describe("NotepadPpProvider", () => {
  it("isAvailable returns false off Windows", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(true);
    await expect(new NotepadPpProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when none of the plugin dirs exist", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new NotepadPpProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when at least one plugin dir exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Notepad++\\plugins"),
    );
    await expect(new NotepadPpProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when no installed plugin DLL is found", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Notepad++\\plugins"),
    );
    readdirMock.mockResolvedValue(["Config", "APIs", "doc"]);
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when readdir throws", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Notepad++\\plugins"),
    );
    readdirMock.mockRejectedValue(new Error("EACCES"));
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetchPluginIndex fails (not ok)", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("nppjsonviewer.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["NppJSONViewer"]);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("nppjsonviewer.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["NppJSONViewer"]);
    fetchMock.mockRejectedValueOnce(new Error("timeout"));

    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits manual entries from the upstream index", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("nppjsonviewer\\nppjsonviewer.dll"))
        return true;
      if (p.toLowerCase().endsWith("unknownplugin\\unknownplugin.dll"))
        return true;
      return false;
    });
    readdirMock.mockResolvedValue([
      "NppJSONViewer",
      "Config",
      "UnknownPlugin",
    ]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [
          {
            "folder-name": "NppJSONViewer",
            "display-name": "JSON Viewer",
            version: "2.1.0",
            repository: "...",
          },
          {
            "folder-name": "OtherPlugin",
            version: "0.1.0",
          },
        ],
      }),
    );

    const out = await new NotepadPpProvider().listOutdated();
    expect(out).toEqual([
      expect.objectContaining({
        id: "NppJSONViewer",
        name: "JSON Viewer",
        latest: "2.1.0",
        manual: true,
      }),
    ]);
  });

  it("listOutdated returns [] when index entry has no version", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("foo\\foo.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["Foo"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [{ "folder-name": "Foo" /* no version */ }],
      }),
    );
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update returns skipped/manual", async () => {
    const out = await new NotepadPpProvider().update("x");
    expect(out.success).toBe(false);
    expect(out.skipped).toBe(true);
  });

  it("updateAll returns one skipped per input", async () => {
    const out = await new NotepadPpProvider().updateAll([
      { id: "a" } as never,
      { id: "b" } as never,
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.skipped)).toBe(true);
  });

  it("isAvailable returns false when env vars are unset", async () => {
    delete process.env["LOCALAPPDATA"];
    delete process.env["PROGRAMFILES"];
    delete process.env["PROGRAMFILES(X86)"];
    existsSyncMock.mockReturnValue(false);
    await expect(new NotepadPpProvider().isAvailable()).resolves.toBe(false);
  });

  it("uses entry name as display fallback when display-name is absent", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("plain\\plain.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["Plain"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [{ "folder-name": "Plain", version: "1.0.0" }],
      }),
    );
    const out = await new NotepadPpProvider().listOutdated();
    expect(out[0]?.name).toBe("Plain");
  });

  it("handles index with missing npp-plugins key", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("foo\\foo.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["Foo"]);
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("ignores plugin entries whose DLL is missing", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      // Entry "Stub" exists as a folder but no Stub.dll inside.
      return false;
    });
    readdirMock.mockResolvedValue(["Stub"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [{ "folder-name": "Stub", version: "1.0.0" }],
      }),
    );
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });

  it("skips a plugin dir that doesn't exist on disk", async () => {
    // Both LOCALAPPDATA and PROGRAMFILES dirs are candidate paths, but only
    // one exists → exercise the !existsSync(dir) continue branch.
    existsSyncMock.mockImplementation((p: string) => {
      if (p === "C:\\Users\\me\\AppData\\Local\\Notepad++\\plugins") return false;
      if (p === "C:\\Program Files\\Notepad++\\plugins") return true;
      if (p.toLowerCase().endsWith("p\\p.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["P"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [{ "folder-name": "P", version: "1.0.0" }],
      }),
    );
    const out = await new NotepadPpProvider().listOutdated();
    expect(out).toHaveLength(1);
  });

  it("skips index entries with missing folder-name", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Notepad++\\plugins")) return true;
      if (p.toLowerCase().endsWith("foo\\foo.dll")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["Foo"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        "npp-plugins": [{ version: "9.9.9" }, { "folder-name": "Foo" /* no version */ }],
      }),
    );
    await expect(new NotepadPpProvider().listOutdated()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ObsidianPluginsProvider
// ---------------------------------------------------------------------------
describe("ObsidianPluginsProvider", () => {
  it("isAvailable returns false when obsidian.json is missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("isAvailable returns true when obsidian.json exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("obsidian.json"),
    );
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(true);
  });

  it("listOutdated returns [] when no vaults discovered", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("obsidian.json"),
    );
    readFileMock.mockResolvedValueOnce(JSON.stringify({ vaults: {} }));

    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when obsidian.json is unparseable", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("obsidian.json"),
    );
    readFileMock.mockResolvedValueOnce("{not json");
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when vault plugins dir is missing", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      return false;
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ vaults: { vid: { path: "C:\\Vault" } } }),
    );
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when readdir on .obsidian/plugins throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      return false;
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ vaults: { vid: { path: "C:\\Vault" } } }),
    );
    readdirMock.mockRejectedValue(new Error("EACCES"));
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when community index fetch fails", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins\\foo\\manifest.json") return true;
      return false;
    });
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({ vaults: { v: { path: "C:\\Vault" } } }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: "foo", version: "1.0.0" }));
    readdirMock.mockResolvedValueOnce(["foo"]);
    fetchMock.mockResolvedValueOnce(jsonResponse([], false));

    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated returns [] when community index fetch throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins\\foo\\manifest.json") return true;
      return false;
    });
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({ vaults: { v: { path: "C:\\Vault" } } }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: "foo", version: "1.0.0" }));
    readdirMock.mockResolvedValueOnce(["foo"]);
    fetchMock.mockRejectedValueOnce(new Error("timeout"));

    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("listOutdated emits an outdated manual entry", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins\\foo\\manifest.json") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins\\bad\\manifest.json") return true;
      return false;
    });
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({ vaults: { v: { path: "C:\\Vault" } } }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: "foo", version: "1.0.0" }))
      .mockResolvedValueOnce("not-json"); // unparseable manifest skipped
    readdirMock.mockResolvedValueOnce(["foo", "bad"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: "foo", repo: "owner/foo" },
        { id: "without-repo" },
      ]),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.0");

    const out = await new ObsidianPluginsProvider().listOutdated();
    expect(out).toEqual([
      expect.objectContaining({
        id: "foo",
        current: "1.0.0",
        latest: "2.0.0",
        manual: true,
      }),
    ]);
    expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith("owner/foo");
  });

  it("listOutdated filters when latest equals current or repo unknown or latest=null", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      if (
        p === "C:\\Vault\\.obsidian\\plugins\\same\\manifest.json" ||
        p === "C:\\Vault\\.obsidian\\plugins\\orphan\\manifest.json" ||
        p === "C:\\Vault\\.obsidian\\plugins\\null\\manifest.json"
      )
        return true;
      return false;
    });
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({ vaults: { v: { path: "C:\\Vault" } } }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: "same", version: "1.0.0" }))
      .mockResolvedValueOnce(JSON.stringify({ id: "orphan", version: "1.0.0" }))
      .mockResolvedValueOnce(JSON.stringify({ id: "null", version: "1.0.0" }));
    readdirMock.mockResolvedValueOnce(["same", "orphan", "null"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: "same", repo: "o/s" },
        { id: "null", repo: "o/n" },
      ]),
    );
    fetchGitHubReleaseLatestMock.mockImplementation(async (repo: string) => {
      if (repo === "o/s") return "1.0.0"; // same
      if (repo === "o/n") return null; // null
      return "9.9.9";
    });

    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("skips vault path entries that are not strings or don't exist", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("obsidian.json"),
    );
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        vaults: {
          a: { path: 123 },
          b: { /* no path */ },
          c: { path: "C:\\Missing" },
        },
      }),
    );
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("update returns skipped manual outcome", async () => {
    const out = await new ObsidianPluginsProvider().update("foo");
    expect(out).toMatchObject({ id: "foo", success: false, skipped: true });
  });

  it("updateAll returns one skipped entry per input", async () => {
    const out = await new ObsidianPluginsProvider().updateAll([
      { id: "a" } as never,
    ]);
    expect(out[0]?.skipped).toBe(true);
  });

  it("obsidianConfigFile resolves on darwin via HOME", async () => {
    setPlatform("darwin");
    process.env["HOME"] = "/Users/me";
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("obsidian"),
    );
  });

  it("obsidianConfigFile resolves on linux via XDG_CONFIG_HOME", async () => {
    setPlatform("linux");
    process.env["XDG_CONFIG_HOME"] = "/home/me/.config";
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("obsidian"),
    );
  });

  it("obsidianConfigFile resolves on linux via HOME fallback", async () => {
    setPlatform("linux");
    delete process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = "/home/me";
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("obsidianConfigFile returns '' on win32 with no APPDATA", async () => {
    delete process.env["APPDATA"];
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith("");
  });

  it("obsidianConfigFile returns '' on darwin with no HOME", async () => {
    setPlatform("darwin");
    delete process.env["HOME"];
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("obsidianConfigFile returns '' on linux with no XDG/HOME", async () => {
    setPlatform("linux");
    delete process.env["XDG_CONFIG_HOME"];
    delete process.env["HOME"];
    existsSyncMock.mockReturnValue(false);
    await expect(
      new ObsidianPluginsProvider().isAvailable(),
    ).resolves.toBe(false);
  });

  it("listOutdated skips vault entries pointing at a non-existent path", async () => {
    // Vault path resolves to a string but existsSync returns false → filtered.
    existsSyncMock.mockImplementation((p: string) => p.endsWith("obsidian.json"));
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ vaults: { v: { path: "C:\\Missing" } } }),
    );
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("dedupes a plugin found in multiple vaults (keeps the first)", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault1" || p === "C:\\Vault2") return true;
      if (
        p === "C:\\Vault1\\.obsidian\\plugins" ||
        p === "C:\\Vault2\\.obsidian\\plugins"
      )
        return true;
      if (
        p === "C:\\Vault1\\.obsidian\\plugins\\dup\\manifest.json" ||
        p === "C:\\Vault2\\.obsidian\\plugins\\dup\\manifest.json"
      )
        return true;
      return false;
    });
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({
          vaults: {
            a: { path: "C:\\Vault1" },
            b: { path: "C:\\Vault2" },
          },
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ id: "dup", version: "1.0.0" }))
      .mockResolvedValueOnce(JSON.stringify({ id: "dup", version: "1.0.0" }));
    readdirMock.mockResolvedValue(["dup"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: "dup", repo: "owner/dup" }]),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValue("2.0.0");

    const out = await new ObsidianPluginsProvider().listOutdated();
    expect(out).toHaveLength(1);
  });

  it("listOutdated returns [] when obsidian.json has no `vaults` field", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("obsidian.json"),
    );
    readFileMock.mockResolvedValueOnce(JSON.stringify({ otherField: 1 }));
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });

  it("scanVaultPlugins skips plugins without manifest.json", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("obsidian.json")) return true;
      if (p === "C:\\Vault") return true;
      if (p === "C:\\Vault\\.obsidian\\plugins") return true;
      // Note: no manifest.json existsSync match.
      return false;
    });
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ vaults: { v: { path: "C:\\Vault" } } }),
    );
    readdirMock.mockResolvedValueOnce(["bare-plugin"]);
    await expect(
      new ObsidianPluginsProvider().listOutdated(),
    ).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SublimePcProvider
// ---------------------------------------------------------------------------
describe("SublimePcProvider", () => {
  it("isAvailable returns true/false based on existsSync", async () => {
    existsSyncMock.mockReturnValueOnce(true);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(true);
    existsSyncMock.mockReturnValueOnce(false);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when file missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new SublimePcProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when readFile throws", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockRejectedValue(new Error("EACCES"));
    await expect(new SublimePcProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when JSON parsing fails", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockResolvedValue("not json {{{");
    await expect(new SublimePcProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses JSON-with-comments and trailing commas", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockResolvedValue(`{
      // a line comment with "quotes" should not eat the string field
      /* block comment */
      "installed_packages": [
        "Package Control",
        "SideBarEnhancements", // trailing comment
        123,
        "TrailingComma",
      ],
    }`);
    const out = await new SublimePcProvider().listOutdated();
    expect(out.map((p) => p.id)).toEqual([
      "Package Control",
      "SideBarEnhancements",
      "TrailingComma",
    ]);
    for (const p of out) {
      expect(p.manual).toBe(true);
      expect(p.current).toBe("?");
      expect(p.latest).toBe("?");
    }
  });

  it("listOutdated handles missing installed_packages field", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileMock.mockResolvedValue('{"foo": 1}');
    await expect(new SublimePcProvider().listOutdated()).resolves.toEqual([]);
  });

  it("handles escaped quotes inside strings during comment-stripping", async () => {
    existsSyncMock.mockReturnValue(true);
    // The string contains an escaped quote (\") and `//` which must NOT be
    // stripped because they live inside a JSON string.
    readFileMock.mockResolvedValue(
      `{ "installed_packages": ["a\\"b // not-comment", "Plain"] }`,
    );
    const out = await new SublimePcProvider().listOutdated();
    expect(out.map((p) => p.id)).toEqual([
      `a"b // not-comment`,
      "Plain",
    ]);
  });

  it("update returns skipped/manual outcome", async () => {
    const o = await new SublimePcProvider().update("foo");
    expect(o.skipped).toBe(true);
    expect(o.success).toBe(false);
  });

  it("updateAll returns one skipped entry per input", async () => {
    const o = await new SublimePcProvider().updateAll([{ id: "a" } as never]);
    expect(o[0]?.skipped).toBe(true);
  });

  it("packageControlSettingsFile resolves on darwin via HOME", async () => {
    setPlatform("darwin");
    process.env["HOME"] = "/Users/me";
    existsSyncMock.mockReturnValue(false);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("Sublime Text"),
    );
  });

  it("packageControlSettingsFile resolves on linux via XDG", async () => {
    setPlatform("linux");
    process.env["XDG_CONFIG_HOME"] = "/x";
    existsSyncMock.mockReturnValue(false);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("sublime-text"),
    );
  });

  it("packageControlSettingsFile resolves on linux via HOME fallback", async () => {
    setPlatform("linux");
    delete process.env["XDG_CONFIG_HOME"];
    process.env["HOME"] = "/h";
    existsSyncMock.mockReturnValue(false);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(false);
  });

  it("packageControlSettingsFile resolves to empty when win32 has no APPDATA", async () => {
    delete process.env["APPDATA"];
    existsSyncMock.mockReturnValue(false);
    await expect(new SublimePcProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith("");
  });
});

// ---------------------------------------------------------------------------
// UnityHubProvider
// ---------------------------------------------------------------------------
describe("UnityHubProvider", () => {
  it("isAvailable returns false off Windows", async () => {
    setPlatform("linux");
    await expect(new UnityHubProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when no Unity Hub.exe is found", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new UnityHubProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when Unity Hub.exe is present", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    await expect(new UnityHubProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] off Windows", async () => {
    setPlatform("linux");
    await expect(new UnityHubProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated uses editors-v2.json when present", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    readFileMock.mockResolvedValue(
      JSON.stringify({
        "2022.3.42f1": {
          version: "2022.3.42f1",
          location: ["C:\\Unity\\2022.3.42f1\\Editor\\Unity.exe"],
        },
        "2021.3.10f1": { version: "2021.3.10f1" /* no location */ },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2022.3.50f1" }] }),
    );

    const out = await new UnityHubProvider().listOutdated();
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "2022.3.42f1",
      latest: "2022.3.50f1",
      manual: true,
    });
    expect(out[1]?.note).toBe("Hub-managed");
  });

  it("listOutdated falls back to '?' when fetchLatestLts fails (not ok)", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    readFileMock.mockResolvedValue(
      JSON.stringify({ "2022.3.0f1": { version: "2022.3.0f1" } }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

    const out = await new UnityHubProvider().listOutdated();
    expect(out[0]?.latest).toBe("?");
  });

  it("listOutdated falls back to '?' when fetch throws", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    readFileMock.mockResolvedValue(
      JSON.stringify({ "2022.3.0f1": { version: "2022.3.0f1" } }),
    );
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    const out = await new UnityHubProvider().listOutdated();
    expect(out[0]?.latest).toBe("?");
  });

  it("listOutdated falls back to '?' when fetch returns no lts data", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    readFileMock.mockResolvedValue(
      JSON.stringify({ "2022.3.0f1": { version: "2022.3.0f1" } }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const out = await new UnityHubProvider().listOutdated();
    expect(out[0]?.latest).toBe("?");
  });

  it("listOutdated falls back to Hub CLI when editors-v2 unparseable", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    readFileMock.mockResolvedValueOnce("{not json");
    runMock.mockResolvedValueOnce(
      mkRun(
        "2022.3.42f1 , installed at C:\\Unity\\Editor\\Unity.exe\nnoversion\njunkline",
      ),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2022.3.50f1" }] }),
    );

    const out = await new UnityHubProvider().listOutdated();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "2022.3.42f1",
      latest: "2022.3.50f1",
    });
  });

  it("listOutdated falls back to Hub CLI when editors-v2.json is missing", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    runMock.mockResolvedValueOnce(
      mkRun("2022.3.42f1 , installed at C:\\Unity\\Editor\\Unity.exe\n"),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2022.3.50f1" }] }),
    );

    const out = await new UnityHubProvider().listOutdated();
    expect(out).toHaveLength(1);
  });

  it("listOutdated returns [] when Hub CLI fails", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new UnityHubProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no Hub.exe at all", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new UnityHubProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when CLI yields no parsable line", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    runMock.mockResolvedValueOnce(mkRun("garbage\nempty\n"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2022.3.50f1" }] }),
    );
    await expect(new UnityHubProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update returns skipped/manual", async () => {
    const out = await new UnityHubProvider().update("v");
    expect(out.skipped).toBe(true);
    expect(out.success).toBe(false);
  });

  it("updateAll returns one skipped per input", async () => {
    const out = await new UnityHubProvider().updateAll([
      { id: "v" } as never,
    ]);
    expect(out[0]?.skipped).toBe(true);
  });

  it("editorsConfigFile returns '' on win32 with no APPDATA", async () => {
    delete process.env["APPDATA"];
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new UnityHubProvider().listOutdated()).resolves.toEqual([]);
  });

  it("parses CLI lines without 'installed at' suffix", async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith("Unity Hub.exe"));
    runMock.mockResolvedValueOnce(mkRun("2022.3.42f1\n"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2022.3.50f1" }] }),
    );
    const out = await new UnityHubProvider().listOutdated();
    expect(out).toHaveLength(1);
    expect(out[0]?.note).toBe("Hub-managed");
  });

  it("falls back to CLI when editors-v2.json contains only invalid entries", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Unity Hub.exe")) return true;
      if (p.endsWith("editors-v2.json")) return true;
      return false;
    });
    // Empty object → out.length === 0 → falls through to CLI.
    readFileMock.mockResolvedValueOnce("{}");
    runMock.mockResolvedValueOnce(mkRun("2021.3.0f1\n"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ lts: [{ version: "2021.3.50f1" }] }),
    );
    const out = await new UnityHubProvider().listOutdated();
    expect(out).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ZedExtProvider
// ---------------------------------------------------------------------------
describe("ZedExtProvider", () => {
  it("isAvailable returns false on win32 with no LOCALAPPDATA dir", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when zed installed dir exists", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Zed\\extensions\\installed"),
    );
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when dir missing", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when readdir throws", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Zed\\extensions\\installed"),
    );
    readdirMock.mockRejectedValue(new Error("EACCES"));
    await expect(new ZedExtProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated reads extension.toml when present", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Zed\\extensions\\installed")) return true;
      if (p.endsWith("foo\\extension.toml")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["foo"]);
    readFileMock.mockResolvedValueOnce(`name = "foo"\nversion = "1.2.3"\n`);

    const out = await new ZedExtProvider().listOutdated();
    expect(out).toEqual([
      expect.objectContaining({
        id: "foo",
        current: "1.2.3",
        latest: "?",
        manual: true,
      }),
    ]);
  });

  it("listOutdated falls back to extension.json when toml is unreadable", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Zed\\extensions\\installed")) return true;
      if (p.endsWith("foo\\extension.toml")) return true;
      if (p.endsWith("foo\\extension.json")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["foo"]);
    readFileMock
      .mockRejectedValueOnce(new Error("EACCES")) // toml read fails
      .mockResolvedValueOnce(JSON.stringify({ version: "9.9.9" }));

    const out = await new ZedExtProvider().listOutdated();
    expect(out[0]?.current).toBe("9.9.9");
  });

  it("listOutdated falls back to extension.json when toml has no version match", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Zed\\extensions\\installed")) return true;
      if (p.endsWith("foo\\extension.toml")) return true;
      if (p.endsWith("foo\\extension.json")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["foo"]);
    readFileMock
      .mockResolvedValueOnce(`name = "foo"\n`) // no version line
      .mockResolvedValueOnce(JSON.stringify({ version: "9.9.9" }));

    const out = await new ZedExtProvider().listOutdated();
    expect(out[0]?.current).toBe("9.9.9");
  });

  it("listOutdated skips entry when neither file yields a version", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Zed\\extensions\\installed")) return true;
      if (p.endsWith("foo\\extension.json")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["foo"]);
    readFileMock.mockResolvedValueOnce("not json {{{");

    await expect(new ZedExtProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips entry when no metadata files exist", async () => {
    existsSyncMock.mockImplementation((p: string) =>
      p.endsWith("Zed\\extensions\\installed"),
    );
    readdirMock.mockResolvedValue(["foo"]);
    await expect(new ZedExtProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update returns skipped/manual", async () => {
    const out = await new ZedExtProvider().update("foo");
    expect(out.skipped).toBe(true);
    expect(out.success).toBe(false);
  });

  it("updateAll returns one skipped per input", async () => {
    const out = await new ZedExtProvider().updateAll([{ id: "f" } as never]);
    expect(out[0]?.skipped).toBe(true);
  });

  it("zedInstalledDir resolves on darwin via HOME", async () => {
    setPlatform("darwin");
    process.env["HOME"] = "/Users/me";
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("Zed"),
    );
  });

  it("zedInstalledDir resolves on linux via XDG_DATA_HOME", async () => {
    setPlatform("linux");
    process.env["XDG_DATA_HOME"] = "/x";
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("zed"),
    );
  });

  it("zedInstalledDir resolves on linux via HOME fallback", async () => {
    setPlatform("linux");
    delete process.env["XDG_DATA_HOME"];
    process.env["HOME"] = "/h";
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
  });

  it("zedInstalledDir returns '' on win32 with no LOCALAPPDATA", async () => {
    delete process.env["LOCALAPPDATA"];
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("zedInstalledDir returns '' on darwin with no HOME", async () => {
    setPlatform("darwin");
    delete process.env["HOME"];
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
  });

  it("zedInstalledDir returns '' on linux with no HOME and no XDG", async () => {
    setPlatform("linux");
    delete process.env["XDG_DATA_HOME"];
    delete process.env["HOME"];
    existsSyncMock.mockReturnValue(false);
    await expect(new ZedExtProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated treats extension.json without `version` field as no-version", async () => {
    existsSyncMock.mockImplementation((p: string) => {
      if (p.endsWith("Zed\\extensions\\installed")) return true;
      if (p.endsWith("foo\\extension.json")) return true;
      return false;
    });
    readdirMock.mockResolvedValue(["foo"]);
    readFileMock.mockResolvedValueOnce(JSON.stringify({ name: "foo" }));
    await expect(new ZedExtProvider().listOutdated()).resolves.toEqual([]);
  });
});
