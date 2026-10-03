import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * doctorCommand reads the provider status through the bounded detection
 * (readProviderStatus, tested on its own), hands the detected/missing groups
 * to the status renderer, then prints the "Système" section the CLI modules
 * contribute.
 */
const { readProviderStatusMock, renderProvidersStatusMock } = vi.hoisted(() => ({
  readProviderStatusMock: vi.fn(),
  renderProvidersStatusMock: vi.fn(() => "PROVIDERS"),
}));
vi.mock("../../src/core/platform/provider-status.js", () => ({
  readProviderStatus: readProviderStatusMock,
}));
vi.mock("../../src/ui/table.js", () => ({
  renderProvidersStatus: renderProvidersStatusMock,
  renderScanTable: vi.fn(),
}));

import type { CliModule } from "../../src/commands/cli/cli-module.js";
import { DIAGNOSTIC_TIMEOUT_MS, doctorCommand } from "../../src/commands/doctor.js";

let stdout: ReturnType<typeof vi.spyOn>;
const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");
const printed = (): string =>
  stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("").replace(ANSI, "");

beforeEach(() => {
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  readProviderStatusMock.mockResolvedValue({
    platform: "win32",
    detected: [{ id: "winget", displayName: "winget" }],
    missing: [
      { id: "scoop", displayName: "Scoop" },
      { id: "choco", displayName: "Chocolatey", installHint: "https://chocolatey.org" },
    ],
    incompatible: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function reporting(id: string, diagnostics: CliModule["diagnostics"]): CliModule {
  return { id, order: 100, ...(diagnostics && { diagnostics }) };
}

describe("doctorCommand", () => {
  it("renders the detected and missing groups from the bounded detection", async () => {
    await expect(doctorCommand()).resolves.toBe(0);
    expect(readProviderStatusMock).toHaveBeenCalledOnce();
    expect(renderProvidersStatusMock).toHaveBeenCalledWith(
      ["winget"],
      [
        { id: "scoop", displayName: "Scoop" },
        { id: "choco", displayName: "Chocolatey", installHint: "https://chocolatey.org" },
      ],
    );
    expect(printed()).toBe("PROVIDERS\n");
  });

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
      `  ${"─".repeat(40)}`,
      `  ● ${"Terminal intégré".padEnd(24)} disponible`,
      `  ○ ${"Planification".padEnd(24)} désactivée`,
      `  ▲ ${"Déclencheur".padEnd(24)} absent`,
      "",
    ]);
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
