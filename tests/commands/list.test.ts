import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCommand } from "../../src/commands/list.js";
import type { ScanEvent } from "../../src/core/history/types.js";
import { ALL_PROVIDERS, getProvider } from "../../src/core/registry.js";
import type { OutdatedPackage, ProviderScanResult } from "../../src/core/types.js";
import { pkg } from "../support/builders.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

/**
 * `gup list`: what it prints and what it records. The registered providers
 * are the boundary — every probe answers "not installed" except the ones a
 * test installs, which list fixed rows — and everything between (registry,
 * filters, ownership, history, table) runs for real. stdout is not a
 * terminal here: the scan leaves one summary line instead of a screen.
 */

const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");
let stdout = "";
let stderr = "";
let historyDir: string;

/** The registered providers in `installed` answer present and list their rows; the rest are absent. */
function onMachine(installed: Readonly<Record<string, readonly OutdatedPackage[]>>): void {
  for (const provider of ALL_PROVIDERS) {
    const rows = installed[provider.id];
    vi.spyOn(provider, "isAvailable").mockResolvedValue(rows !== undefined);
    vi.spyOn(provider, "listOutdated").mockResolvedValue([...(rows ?? [])]);
  }
}

const NPM_ROWS = [pkg("typescript", { current: "6.0.2", latest: "6.0.3" })];
const PIP_ROWS = [pkg("requests", { current: "2.32.0", latest: "2.33.0" })];
/** vscode-ext is a slow provider (one Marketplace request per extension): `--fast` skips it. */
const VSCODE_ROWS = [pkg("ms-python.python", { current: "2026.1.0", latest: "2026.2.0" })];
const MACHINE = { "npm-g": NPM_ROWS, pip: PIP_ROWS, "vscode-ext": VSCODE_ROWS };

function scanned(): ProviderScanResult[] {
  return JSON.parse(stdout) as ProviderScanResult[];
}

function recordedScans(): ScanEvent[] {
  return readdirSync(historyDir)
    .flatMap((file) => readFileSync(join(historyDir, file), "utf8").split("\n"))
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ScanEvent);
}

beforeEach(() => {
  stdout = "";
  stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk).replace(ANSI, "");
    return true;
  });
  historyDir = mkdtempSync(join(tmpdir(), "gup-list-"));
  vi.stubEnv("GUP_HISTORY", "1");
  vi.stubEnv("GUP_HISTORY_DIR", historyDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  restorePlatform();
  rmSync(historyDir, { recursive: true, force: true });
});

describe("gup list --json", () => {
  it("prints every detected provider's rows as JSON, and records the scan once", async () => {
    onMachine(MACHINE);
    await expect(listCommand({ json: true })).resolves.toBe(0);
    expect(scanned()).toEqual([
      { providerId: "npm-g", available: true, packages: NPM_ROWS },
      { providerId: "pip", available: true, packages: PIP_ROWS },
      { providerId: "vscode-ext", available: true, packages: VSCODE_ROWS },
    ]);
    expect(stdout).toBe(`${JSON.stringify(scanned(), null, 2)}\n`);
    const [scan, ...others] = recordedScans();
    expect(others).toEqual([]);
    expect(scan).toMatchObject({ kind: "scan", outdated: 3 });
  });

  it.each([
    ["--provider", { only: ["pip", "vscode-ext"] }, ["pip", "vscode-ext"]],
    ["--fast", { fast: true }, ["npm-g", "pip"]],
    ["--provider with --fast", { only: ["pip", "vscode-ext"], fast: true }, ["pip"]],
    ["--fast off", { fast: false }, ["npm-g", "pip", "vscode-ext"]],
  ])("scans only what %s keeps", async (_flags, filters, providers) => {
    onMachine(MACHINE);
    await listCommand({ json: true, ...filters });
    expect(scanned().map((result) => result.providerId)).toEqual(providers);
  });
});

describe("gup list", () => {
  it("prints the scan summary, then the table of every update", async () => {
    onMachine(MACHINE);
    await expect(listCommand({ fast: true })).resolves.toBe(0);
    const lines = stdout.replace(ANSI, "").split("\n");
    expect(lines[0]).toMatch(/scan terminé en .* — 2 provider\(s\), 2 mise\(s\) à jour/);
    const table = lines.slice(1).join("\n");
    expect(table).toContain(getProvider("npm-g")!.displayName);
    expect(table).toContain("typescript");
    expect(table).toContain("requests");
    expect(table).not.toContain("ms-python.python");
    expect(table).toContain("2 mise(s) à jour disponible(s)");
    expect(recordedScans()).toHaveLength(1);
  });

  it("keeps to the providers --provider names", async () => {
    onMachine(MACHINE);
    await listCommand({ only: ["pip"] });
    const table = stdout.replace(ANSI, "");
    expect(table).toContain("requests");
    expect(table).not.toContain("typescript");
    expect(table).toContain("1 mise(s) à jour disponible(s)");
  });
});

describe("gup list --provider ids gup cannot act on", () => {
  it("warns about a provider foreign to this OS, then scans as asked", async () => {
    setPlatform("win32");
    onMachine(MACHINE);
    await listCommand({ json: true, only: ["brew-cask", "npm-g"] });
    expect(stderr).toBe(
      "Attention : Provider brew-cask indisponible sur Windows (macOS uniquement) — ignoré.\n",
    );
    expect(scanned().map((result) => result.providerId)).toEqual(["npm-g"]);
  });

  it("warns about an id no provider is registered under", async () => {
    onMachine({});
    await listCommand({ json: true, only: ["nope"] });
    expect(stderr).toContain("Provider inconnu: nope — ignoré.");
  });

  it("keeps stdout pure JSON while it warns", async () => {
    setPlatform("linux");
    onMachine({});
    await listCommand({ json: true, only: ["brew-cask"] });
    expect(stderr).toContain("indisponible sur Linux");
    expect(stdout).toBe("[]\n");
  });

  it("says nothing about providers it can act on", async () => {
    setPlatform("darwin");
    onMachine({});
    await listCommand({ json: true, only: ["brew-cask", "npm-g"] });
    expect(stderr).toBe("");
  });
});
