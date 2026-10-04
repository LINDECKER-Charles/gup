import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * doctorCommand reads the provider status through the bounded detection
 * (readProviderStatus, tested on its own), prints the three provider groups,
 * then the "Système" section the CLI modules contribute. Assertions read the
 * printed text with colours stripped: the meaning must survive NO_COLOR.
 */
const { readProviderStatusMock } = vi.hoisted(() => ({ readProviderStatusMock: vi.fn() }));
vi.mock("../../src/core/platform/provider-status.js", () => ({
  readProviderStatus: readProviderStatusMock,
}));

import type { CliModule } from "../../src/commands/cli/cli-module.js";
import { DIAGNOSTIC_TIMEOUT_MS, doctorCommand } from "../../src/commands/doctor.js";
import { PLATFORMS } from "../../src/core/platform/platforms.js";
import type { ProviderStatusReport } from "../../src/core/platform/types.js";
import { DOCTOR_PROVIDER_LABELS } from "../../src/ui/text/providers-labels.js";

let stdout: ReturnType<typeof vi.spyOn>;
const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");
const printed = (): string =>
  stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("").replace(ANSI, "");

const WINDOWS_REPORT: ProviderStatusReport = {
  platform: "win32",
  detected: [{ id: "winget", displayName: "Winget", platforms: PLATFORMS.windows }],
  missing: [
    { id: "scoop", displayName: "Scoop", platforms: PLATFORMS.windows },
    {
      id: "choco",
      displayName: "Chocolatey",
      installHint: "https://chocolatey.org/install",
      platforms: PLATFORMS.windows,
    },
  ],
  incompatible: [
    {
      id: "brew",
      displayName: "Homebrew",
      installHint: "https://brew.sh",
      platforms: PLATFORMS.notWindows,
    },
    { id: "brew-cask", displayName: "Homebrew (casks)", platforms: PLATFORMS.macos },
  ],
};

beforeEach(() => {
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  readProviderStatusMock.mockResolvedValue(WINDOWS_REPORT);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function reporting(id: string, diagnostics: CliModule["diagnostics"]): CliModule {
  return { id, order: 100, ...(diagnostics && { diagnostics }) };
}

/** The printed lines of the section titled `title`, up to the next blank line. */
function sectionOf(title: string): string[] {
  const lines = printed().split("\n");
  const start = lines.indexOf(`  ${title}`);
  expect(start, `section "${title}"`).toBeGreaterThanOrEqual(0);
  const end = lines.indexOf("", start);
  return lines.slice(start, end === -1 ? undefined : end);
}

const RULE = `  ${"─".repeat(40)}`;

describe("doctorCommand: providers", () => {
  it("lists detected, missing, then incompatible providers from one detection", async () => {
    await expect(doctorCommand()).resolves.toBe(0);
    expect(readProviderStatusMock).toHaveBeenCalledOnce();
    const titles = printed()
      .split("\n")
      .filter((_line, index, lines) => lines[index + 1] === RULE);
    expect(titles).toEqual([
      `  ${DOCTOR_PROVIDER_LABELS.detected}`,
      `  ${DOCTOR_PROVIDER_LABELS.missing}`,
      "  Incompatibles avec Windows",
    ]);
  });

  it("shows how to install a missing provider", async () => {
    await doctorCommand();
    expect(sectionOf(DOCTOR_PROVIDER_LABELS.missing).slice(2)).toEqual([
      `  ○ ${"Scoop".padEnd(24)} (scoop)`,
      `  ○ ${"Chocolatey".padEnd(24)} (choco)`,
      "      → https://chocolatey.org/install",
    ]);
  });

  it("marks each incompatible provider with a glyph and where it runs, never a hint", async () => {
    await doctorCommand();
    expect(sectionOf("Incompatibles avec Windows").slice(2)).toEqual([
      `  – ${"Homebrew".padEnd(24)} ${"(brew)".padEnd(20)} macOS/Linux uniquement`,
      `  – ${"Homebrew (casks)".padEnd(24)} ${"(brew-cask)".padEnd(20)} macOS uniquement`,
    ]);
    expect(printed()).not.toContain("https://brew.sh");
  });

  it("names the OS the report was computed on", async () => {
    readProviderStatusMock.mockResolvedValue({
      platform: "darwin",
      detected: [],
      missing: [],
      incompatible: [{ id: "winget", displayName: "Winget", platforms: PLATFORMS.windows }],
    });
    await doctorCommand();
    expect(sectionOf("Incompatibles avec macOS").slice(2)).toEqual([
      `  – ${"Winget".padEnd(24)} ${"(winget)".padEnd(20)} Windows uniquement`,
    ]);
  });

  it("leaves the incompatible section out when every provider runs here", async () => {
    readProviderStatusMock.mockResolvedValue({ ...WINDOWS_REPORT, incompatible: [] });
    await doctorCommand();
    expect(printed()).not.toContain("Incompatibles");
    expect(printed()).toContain(DOCTOR_PROVIDER_LABELS.missing);
  });
});

describe("doctorCommand: Système", () => {
  it("prints no Système section when no module reports anything", async () => {
    await doctorCommand([reporting("list", undefined)]);
    expect(printed()).not.toContain("Système");
  });

  it("prints every module's lines under Système, with a mark per status", async () => {
    const terminal = reporting("embedded-terminal", async () => [
      { label: "Terminal intégré", value: "disponible", status: "ok" },
    ]);
    const scheduler = reporting("schedule", async () => [
      { label: "Planification", value: "désactivée", status: "off" },
      { label: "Déclencheur", value: "absent", status: "warn" },
    ]);
    await doctorCommand([terminal, scheduler]);
    const lines = printed().split("\n");
    const section = lines.slice(lines.indexOf("  Système"));
    expect(section).toEqual([
      "  Système",
      RULE,
      `  ● ${"Terminal intégré".padEnd(24)} disponible`,
      `  ○ ${"Planification".padEnd(24)} désactivée`,
      `  ▲ ${"Déclencheur".padEnd(24)} absent`,
      "",
    ]);
  });

  it("shortens the home directory in every module's value, as the log does", async () => {
    const file = join(homedir(), "AppData", "Roaming", "gup", "config.json");
    const settings = reporting("settings", async () => [
      { label: "Configuration", value: `${file} — enregistré`, status: "ok" },
    ]);
    await doctorCommand([settings]);
    const shortened = join("~", "AppData", "Roaming", "gup", "config.json");
    expect(printed()).toContain(`${shortened} — enregistré`);
    expect(printed()).not.toContain(homedir());
  });

  it("reports a module whose diagnostics fail, and keeps the others", async () => {
    const broken = reporting("journal", async () => {
      throw new Error("dossier illisible");
    });
    const fine = reporting("settings", async () => [
      { label: "Configuration", value: "chargée", status: "ok" },
    ]);
    await doctorCommand([broken, fine]);
    expect(printed()).toContain(
      `▲ ${"journal".padEnd(24)} diagnostic indisponible (dossier illisible)`,
    );
    expect(printed()).toContain("Configuration");
  });

  it("does not wait for a module whose diagnostics never answer", async () => {
    vi.useFakeTimers();
    const stuck = reporting("schedule", () => new Promise(() => {}));
    const done = doctorCommand([stuck]);
    await vi.advanceTimersByTimeAsync(DIAGNOSTIC_TIMEOUT_MS);
    await expect(done).resolves.toBe(0);
    expect(printed()).toContain("diagnostic indisponible (délai dépassé)");
  });
});
