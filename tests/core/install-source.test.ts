import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which package manager owns a binary, and the exact command gup hands each
 * one: the argv every delegating provider ends up spawning. Faked at the
 * boundaries only — the runner (PATH lookups, package-database probes,
 * installs) and `realpath` (Homebrew's symlinks). The path classifier itself
 * is pinned against adversarial paths in tests/security/install-source.test.ts.
 */
const boundary = vi.hoisted(() => ({
  /** `argv.join(" ")` → stdout (exit 0), `null` (non-zero exit) or an Error (rejects). */
  answers: new Map<string, string | null | Error>(),
  /** Symlink → target, or the Error `realpath` throws; any other path resolves to itself. */
  links: new Map<string, string | Error>(),
  probes: [] as string[],
  reads: [] as string[],
  installs: [] as Array<{ argv: string[]; options: unknown }>,
  isInstallFailing: false,
}));

vi.mock("../../src/core/runner.js", () => ({
  run: async (command: string, args: string[]) => {
    const key = [command, ...args].join(" ");
    boundary.probes.push(key);
    const answer = boundary.answers.get(key) ?? null;
    if (answer instanceof Error) throw answer;
    return answer === null
      ? { stdout: "", stderr: "", exitCode: 1, failed: true }
      : { stdout: answer, stderr: "", exitCode: 0, failed: false };
  },
  runInherit: async (command: string, args: string[], options: unknown) => {
    boundary.installs.push({ argv: [command, ...args], options });
    const failed = boundary.isInstallFailing;
    return { stdout: "", stderr: "", exitCode: failed ? 1 : 0, failed };
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  realpath: async (path: string) => {
    boundary.reads.push(path);
    const target = boundary.links.get(path) ?? path;
    if (target instanceof Error) throw target;
    return target;
  },
}));

import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
  installedByField,
  resolveBinaryPath,
  runPmUpdate,
  upgradeNeedsRoot,
  type InstallSource,
  type PackageIds,
} from "../../src/core/install-source.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

beforeEach(() => {
  boundary.answers.clear();
  boundary.links.clear();
  boundary.probes.length = 0;
  boundary.reads.length = 0;
  boundary.installs.length = 0;
  boundary.isInstallFailing = false;
});

afterEach(() => restorePlatform());

interface Machine {
  readonly platform: NodeJS.Platform;
  readonly answers?: Readonly<Record<string, string | null | Error>>;
  readonly links?: Readonly<Record<string, string | Error>>;
}

function onMachine(machine: Machine): void {
  setPlatform(machine.platform);
  for (const [argv, answer] of Object.entries(machine.answers ?? {})) {
    boundary.answers.set(argv, answer);
  }
  for (const [link, target] of Object.entries(machine.links ?? {})) {
    boundary.links.set(link, target);
  }
}

const SCOOP_SHIM = "C:\\Users\\u\\scoop\\shims\\terraform.exe";
const WINGET_PACKAGE = "C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\X\\tf.exe";
const BREW_SHIM = "/opt/homebrew/bin/kubectl";
const BREW_CELLAR = "/opt/homebrew/Cellar/kubernetes-cli/1.36.3/bin/kubectl";
const HELM_PROBES = ["which helm", "dpkg -S /usr/bin/helm", "rpm -qf /usr/bin/helm"];

interface DetectionRow extends Machine {
  readonly label: string;
  readonly binary: string;
  readonly source: InstallSource;
  /** Every process spawned, in order. */
  readonly probes: readonly string[];
}

const DETECTION: readonly DetectionRow[] = [
  {
    label: "Windows: the first `where` hit, a scoop shim",
    platform: "win32",
    binary: "terraform",
    answers: { "where terraform": `${SCOOP_SHIM}\r\nC:\\Other\\terraform.exe` },
    source: "scoop",
    probes: ["where terraform"],
  },
  {
    label: "Windows: a chocolatey install",
    platform: "win32",
    binary: "kubectl",
    answers: { "where kubectl": "C:\\ProgramData\\chocolatey\\bin\\kubectl.exe" },
    source: "choco",
    probes: ["where kubectl"],
  },
  {
    label: "Windows: a WindowsApps install is winget's",
    platform: "win32",
    binary: "foo",
    answers: { "where foo": "C:\\Program Files\\WindowsApps\\Foo_1.0__abc\\foo.exe" },
    source: "winget",
    probes: ["where foo"],
  },
  {
    label: "Windows: an unknown location, and never a package-database probe",
    platform: "win32",
    binary: "foo",
    answers: { "where foo": "C:\\Tools\\foo.exe" },
    source: "manual",
    probes: ["where foo"],
  },
  {
    label: "any OS: a binary that is not on PATH",
    platform: "linux",
    binary: "nope",
    source: "manual",
    probes: ["which nope"],
  },
  {
    label: "any OS: a lookup that answers nothing",
    platform: "win32",
    binary: "ghost",
    answers: { "where ghost": "   \n   " },
    source: "manual",
    probes: ["where ghost"],
  },
  {
    label: "macOS: the Homebrew shim followed to its Cellar",
    platform: "darwin",
    binary: "kubectl",
    answers: { "which kubectl": BREW_SHIM },
    links: { [BREW_SHIM]: BREW_CELLAR },
    source: "brew",
    probes: ["which kubectl"],
  },
  {
    label: "macOS: a symlink that cannot be followed keeps its own path",
    platform: "darwin",
    binary: "terraform",
    answers: { "which terraform": "/opt/homebrew/bin/terraform" },
    links: { "/opt/homebrew/bin/terraform": new Error("ELOOP") },
    source: "brew",
    probes: ["which terraform"],
  },
  {
    label: "macOS: a hand install, with no package database to ask",
    platform: "darwin",
    binary: "kubectl",
    answers: { "which kubectl": "/usr/local/bin/kubectl" },
    source: "manual",
    probes: ["which kubectl"],
  },
  {
    label: "Linux: a file dpkg tracks is apt's",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/usr/bin/helm", "dpkg -S /usr/bin/helm": "helm: /usr/bin/helm" },
    source: "apt",
    probes: HELM_PROBES.slice(0, 2),
  },
  {
    label: "Linux: then rpm, whose files are dnf's",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/usr/bin/helm", "rpm -qf /usr/bin/helm": "helm-3.14.0-1.fc40" },
    source: "dnf",
    probes: HELM_PROBES,
  },
  {
    label: "Linux: neither database owns the file",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/usr/bin/helm" },
    source: "manual",
    probes: HELM_PROBES,
  },
  {
    label: "Linux: a database that answers nothing does not own it",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/usr/bin/helm", "dpkg -S /usr/bin/helm": "   \n  " },
    source: "manual",
    probes: HELM_PROBES,
  },
  {
    label: "Linux: probes that cannot even start (the tool absent on this distro)",
    platform: "linux",
    binary: "helm",
    answers: {
      "which helm": "/usr/bin/helm",
      "dpkg -S /usr/bin/helm": new Error("ENOENT: dpkg"),
      "rpm -qf /usr/bin/helm": new Error("ENOENT: rpm"),
    },
    source: "manual",
    probes: HELM_PROBES,
  },
  {
    label: "Linux: no database probe outside a system prefix",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/home/u/.local/bin/helm" },
    source: "manual",
    probes: ["which helm"],
  },
  {
    label: "Linux: Linuxbrew wins over the package database",
    platform: "linux",
    binary: "helm",
    answers: { "which helm": "/home/linuxbrew/.linuxbrew/bin/helm" },
    source: "brew",
    probes: ["which helm"],
  },
];

describe("detectInstallSource", () => {
  it.each(DETECTION.map((row) => [row.label, row] as const))("%s", async (_label, row) => {
    onMachine(row);
    await expect(detectInstallSource(row.binary)).resolves.toBe(row.source);
    expect(boundary.probes).toEqual(row.probes);
  });

  it("never follows a symlink on Windows", async () => {
    onMachine({ platform: "win32", answers: { "where terraform": SCOOP_SHIM } });
    await expect(detectInstallSource("terraform")).resolves.toBe("scoop");
    expect(boundary.reads).toEqual([]);
  });
});

describe("resolveBinaryPath", () => {
  it("is null for a binary that is not on PATH, or a lookup that answers nothing", async () => {
    onMachine({ platform: "win32", answers: { "where ghost": "  \n " } });
    await expect(resolveBinaryPath("ghost")).resolves.toBeNull();
    await expect(resolveBinaryPath("absent")).resolves.toBeNull();
  });

  it("keeps the first PATH hit, followed through its symlink", async () => {
    onMachine({
      platform: "darwin",
      answers: { "which foo": "/opt/homebrew/bin/foo\n/usr/bin/foo" },
      links: { "/opt/homebrew/bin/foo": "/opt/homebrew/Cellar/foo/1.0/bin/foo" },
    });
    await expect(resolveBinaryPath("foo")).resolves.toBe("/opt/homebrew/Cellar/foo/1.0/bin/foo");
  });
});

interface UpgradeRow {
  readonly source: Exclude<InstallSource, "manual">;
  readonly ids: PackageIds;
  readonly argv: readonly string[];
  readonly options?: { readonly shell: boolean };
}

const WINGET_UPGRADE = [
  "winget",
  "upgrade",
  "--id",
  "Hashicorp.Terraform",
  "--silent",
  "--accept-package-agreements",
  "--accept-source-agreements",
];

const UPGRADES: readonly UpgradeRow[] = [
  // scoop is a PowerShell script: its shim only runs through a shell (shell-usage allowlist).
  {
    source: "scoop",
    ids: { scoop: "terraform" },
    argv: ["scoop", "update", "terraform"],
    options: { shell: true },
  },
  { source: "choco", ids: { choco: "terraform" }, argv: ["choco", "upgrade", "terraform", "-y"] },
  { source: "winget", ids: { winget: "Hashicorp.Terraform" }, argv: WINGET_UPGRADE },
  { source: "brew", ids: { brew: "helm" }, argv: ["brew", "upgrade", "--formula", "helm"] },
  // A cask and a formula of the same name are different installs: the cask wins.
  {
    source: "brew",
    ids: { brew: "docker", brewCask: "docker-desktop" },
    argv: ["brew", "upgrade", "--cask", "docker-desktop"],
  },
  // `install --only-upgrade`: `apt-get upgrade <pkg>` would upgrade the whole system.
  {
    source: "apt",
    ids: { apt: "helm" },
    argv: ["sudo", "apt-get", "install", "--only-upgrade", "-y", "helm"],
  },
  { source: "dnf", ids: { dnf: "helm" }, argv: ["sudo", "dnf", "upgrade", "-y", "helm"] },
];

const MANUAL_FALLBACKS: ReadonlyArray<readonly [string, InstallSource, PackageIds]> = [
  ["the source is manual", "manual", { winget: "X.Y" }],
  ["scoop has no id", "scoop", { winget: "Hashicorp.Terraform" }],
  ["choco has no id", "choco", {}],
  ["winget has no id", "winget", {}],
  ["only a brew id is known on a Windows manager", "winget", { brew: "terraform" }],
  ["brew has no id", "brew", {}],
  ["apt has no id", "apt", {}],
  ["dnf has no id", "dnf", {}],
];

describe("runPmUpdate", () => {
  it.each(UPGRADES.map((row) => [row.argv.join(" "), row] as const))(
    "runs `%s`",
    async (_argv, row) => {
      await expect(runPmUpdate("tool", row.source, row.ids, "manuel")).resolves.toEqual({
        id: "tool",
        success: true,
      });
      expect(boundary.installs).toEqual([{ argv: row.argv, options: row.options ?? {} }]);
    },
  );

  it("reports the manager's failure as a failed outcome", async () => {
    boundary.isInstallFailing = true;
    await expect(runPmUpdate("helm", "brew", { brew: "helm" }, "manuel")).resolves.toEqual({
      id: "helm",
      success: false,
    });
  });

  it.each(MANUAL_FALLBACKS)(
    "leaves the update to the user when %s",
    async (_label, source, ids) => {
      await expect(runPmUpdate("tf", source, ids, "à installer à la main")).resolves.toEqual({
        id: "tf",
        success: false,
        skipped: true,
        message: "à installer à la main",
      });
      expect(boundary.installs).toEqual([]);
    },
  );
});

describe("upgradeNeedsRoot", () => {
  const ROOT: ReadonlyArray<readonly [string, InstallSource, PackageIds]> = [
    ["an apt package", "apt", { apt: "pyenv" }],
    ["a dnf package", "dnf", { dnf: "dotnet-sdk-8.0" }],
  ];
  const NO_ROOT: ReadonlyArray<readonly [string, InstallSource, PackageIds]> = [
    ["a distro with no package to upgrade (manual, no sudo)", "dnf", { apt: "pyenv" }],
    ["brew, which never runs under sudo", "brew", { brew: "pyenv" }],
    ["winget", "winget", { winget: "Microsoft.DotNet.SDK.8" }],
    ["a manual install", "manual", { apt: "pyenv" }],
  ];

  it.each(ROOT)("is true for %s", (_label, source, ids) => {
    expect(upgradeNeedsRoot(source, ids)).toBe(true);
  });

  it.each(NO_ROOT)("is false for %s", (_label, source, ids) => {
    expect(upgradeNeedsRoot(source, ids)).toBe(false);
  });
});

const TERRAFORM_IDS: PackageIds = { scoop: "terraform", winget: "Hashicorp.Terraform" };

describe("delegateUpdate", () => {
  it.each([
    ["scoop", SCOOP_SHIM, ["scoop", "update", "terraform"]],
    ["winget", WINGET_PACKAGE, WINGET_UPGRADE],
  ] as const)("upgrades through %s, the manager that owns the binary", async (_via, path, argv) => {
    onMachine({ platform: "win32", answers: { "where terraform": path } });
    const done = await delegateUpdate({
      id: "terraform",
      binary: "terraform",
      packageIds: TERRAFORM_IDS,
      manualMessage: "fallback",
    });
    expect(done).toEqual({ id: "terraform", success: true });
    expect(boundary.installs.map((install) => install.argv)).toEqual([argv]);
  });

  it.each([
    ["the binary is not on PATH", null],
    ["its owner has no id for it", "C:\\ProgramData\\chocolatey\\bin\\terraform.exe"],
  ] as const)("leaves the update to the user when %s", async (_label, path) => {
    onMachine({ platform: "win32", answers: { "where terraform": path } });
    const done = await delegateUpdate({
      id: "terraform",
      binary: "terraform",
      packageIds: TERRAFORM_IDS,
      manualMessage: "télécharger depuis hashicorp.com",
    });
    expect(done).toEqual({
      id: "terraform",
      success: false,
      skipped: true,
      message: "télécharger depuis hashicorp.com",
    });
    expect(boundary.installs).toEqual([]);
  });
});

describe("describeSource", () => {
  it("labels every source", () => {
    const sources: readonly InstallSource[] = [
      "scoop",
      "choco",
      "winget",
      "brew",
      "apt",
      "dnf",
      "manual",
    ];
    expect(sources.map(describeSource)).toEqual([
      "via scoop",
      "via choco",
      "via winget",
      "via brew",
      "via apt",
      "via dnf",
      "manuel",
    ]);
  });
});

describe("installedByField", () => {
  it("names the package manager a row's update goes through", () => {
    expect(installedByField("brew")).toEqual({ installedBy: "brew" });
    expect(installedByField("scoop")).toEqual({ installedBy: "scoop" });
  });

  it("names none for a manual install, so the row keeps its own update", () => {
    expect(installedByField("manual")).toEqual({});
  });
});
