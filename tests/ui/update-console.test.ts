import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `gup update` prints between and around the installers. The console
 * observer reproduces 0.4.0's lines exactly, so scripts and habits survive
 * the move to the shared pipeline.
 */
const { providers, confirmMock, selectMock } = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  confirmMock: vi.fn(),
  selectMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: (id: string) => providers.get(id),
  ALL_PROVIDERS: [],
}));
vi.mock("../../src/core/history/store.js", () => ({ recordUpdate: vi.fn() }));
vi.mock("../../src/core/elevation.js", () => ({
  runElevatedBatch: vi.fn(async (targets: string[]) =>
    targets.map((t) => ({ id: t.slice(t.indexOf(":") + 1), success: true })),
  ),
}));
vi.mock("../../src/ui/prompts/confirm.js", () => ({ confirm: confirmMock }));
vi.mock("../../src/ui/prompts/select.js", () => ({ select: selectMock }));

import chalk from "chalk";
import { buildReport, entryOf } from "../../src/core/update/update-report.js";
import { runUpdates } from "../../src/core/update/update-pipeline.js";
import type { PlannedUpdate } from "../../src/core/update/update-ports.js";
import { consolePorts, printReport } from "../../src/ui/update-console.js";
import { RUN_WAITING, waitingMessage } from "../../src/ui/text/run-labels.js";
import { useLocale } from "../support/locale.js";
import { restorePlatform, setPlatform } from "../support/platform.js";

let stdout: ReturnType<typeof vi.spyOn>;
const printed = (): string => stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("");
const open = { isAbortRequested: () => false };

function fakeProvider(id: string, displayName: string, failing: readonly string[] = []) {
  providers.set(id, {
    id,
    displayName,
    isAvailable: async () => true,
    listOutdated: async () => [],
    update: async (pkgId: string) =>
      failing.includes(pkgId)
        ? { id: pkgId, success: false, retryable: true }
        : { id: pkgId, success: true },
    updateAll: async () => [],
  });
}

const scanned = (id: string, requiresAdmin = false) => ({
  id,
  current: "1",
  latest: "2",
  ...(requiresAdmin && { requiresAdmin }),
});

beforeEach(() => {
  providers.clear();
  confirmMock.mockReset();
  selectMock.mockReset();
  stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

describe("consolePorts", () => {
  it("titles each target as it starts in target mode", async () => {
    fakeProvider("npm-g", "npm -g");
    await runUpdates(
      [
        { providerId: "npm-g", packageId: "typescript" },
        { providerId: "npm-g", packageId: "pnpm" },
      ],
      consolePorts({ gate: open }),
    );
    expect(printed()).toBe(chalk.bold("→ npm -g: typescript\n") + chalk.bold("→ npm -g: pnpm\n"));
  });

  it("titles each provider once with its package count in selection mode", async () => {
    fakeProvider("a", "A");
    fakeProvider("b", "B");
    const requests = ["a1", "a2"].map((id) => ({ providerId: "a", packageId: id, pkg: scanned(id) }));
    requests.push({ providerId: "b", packageId: "b1", pkg: scanned("b1") });
    await runUpdates(requests, consolePorts({ gate: open }));
    expect(printed()).toBe(chalk.bold("\n→ A (2)\n") + chalk.bold("\n→ B (1)\n"));
  });

  it("announces the admin batch before asking, and asks with the platform's wording", async () => {
    fakeProvider("choco", "Chocolatey");
    confirmMock.mockResolvedValueOnce(true);
    setPlatform("win32");
    try {
      await runUpdates(
        [{ providerId: "choco", packageId: "nodejs", pkg: scanned("nodejs", true) }],
        consolePorts({ gate: open }),
      );
    } finally {
      restorePlatform();
    }
    expect(printed()).toBe(chalk.bold("\n→ Admin (1)\n") + chalk.dim("  choco:nodejs\n"));
    expect(confirmMock).toHaveBeenCalledWith({
      message:
        "1 paquet nécessite les droits administrateur. Ouvrir une invite UAC pour le traiter ?",
      default: true,
    });
  });

  it("does not ask for the admin batch under -y, but still announces it", async () => {
    fakeProvider("choco", "Chocolatey");
    await runUpdates(
      [{ providerId: "choco", packageId: "nodejs", pkg: scanned("nodejs", true) }],
      consolePorts({ gate: open, yes: true }),
    );
    expect(confirmMock).not.toHaveBeenCalled();
    expect(printed()).toContain("→ Admin (1)");
  });

  it("explains the retryable failures, then titles the retry pass per provider", async () => {
    fakeProvider("winget", "Winget", ["Git.Git", "7zip"]);
    selectMock.mockResolvedValueOnce("force").mockResolvedValueOnce("none");
    await runUpdates(
      ["Git.Git", "7zip"].map((id) => ({ providerId: "winget", packageId: id, pkg: scanned(id) })),
      consolePorts({ gate: open }),
    );
    const announce = chalk.dim(
      "\n  2 échec(s) récupérable(s) (Winget: 2) — typiquement hash d'installeur, " +
        "manifest locale, ou changement de technologie d'installation.\n",
    );
    const retryHeader = `\n${chalk.bold("  → Winget (retry --force)")} ${chalk.dim("(2)")}\n`;
    expect(printed()).toBe(chalk.bold("\n→ Winget (2)\n") + announce + retryHeader + announce);
    expect(selectMock.mock.calls[0]![0]).toMatchObject({ message: "Stratégie de réessai" });
  });

  it("tells the user it is waiting for another gup run, in the run view's words", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 3, 10, 6), toFake: ["Date"] });
    try {
      const { observer } = consolePorts({ gate: open });
      const startedAt = new Date(2026, 9, 3, 10, 2).toISOString();
      const holder = { kind: "scheduled" as const, pid: 1, startedAt };
      observer.waiting(holder);
      const message = waitingMessage(holder, new Date());
      expect(message).toBe("Une mise à jour planifiée est en cours (commencée il y a 4 min) — attente…");
      expect(printed()).toBe(chalk.dim(`  ${message} (${RUN_WAITING.abandon})\n`));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("printReport", () => {
  const item = (id: string): PlannedUpdate => ({
    providerId: "p",
    packageId: id,
    key: `p:${id}`,
    providerName: "P",
  });

  it("prints successes with their advisories, then skips, then failures over the total", () => {
    printReport(
      buildReport(
        [
          entryOf(item("ok"), { id: "ok", success: true, message: "redémarrage requis" }),
          entryOf(item("skip"), { id: "skip", success: false, skipped: true, message: "manuel" }),
          entryOf(item("ko"), { id: "ko", success: false }),
        ],
        [],
      ),
    );
    expect(printed()).toBe(
      "\n" +
        chalk.green("OK   1 mise(s) à jour effectuée(s)\n") +
        chalk.green("     - ok") +
        chalk.dim(" — redémarrage requis") +
        "\n" +
        chalk.yellow("SKIP 1 action(s) manuelle(s) requise(s):\n") +
        chalk.yellow("     - skip") +
        chalk.dim(" — manuel") +
        "\n" +
        chalk.red("FAIL 1/3 échec(s):\n") +
        chalk.red("     - ko") +
        "\n",
    );
  });

  describe("in English", () => {
    useLocale("en");

    it("agrees each header with its count, the tags unchanged", () => {
      const skip = (id: string) => entryOf(item(id), { id, success: false, skipped: true });
      printReport(
        buildReport(
          [
            entryOf(item("ok"), { id: "ok", success: true }),
            entryOf(item("ok2"), { id: "ok2", success: true }),
            skip("s1"),
            skip("s2"),
            entryOf(item("ko"), { id: "ko", success: false }),
          ],
          [],
        ),
      );
      const headers = printed()
        .split("\n")
        .filter((line) => line !== "" && !line.includes("     - "));
      expect(headers).toEqual([
        chalk.green("OK   2 updates applied"),
        chalk.yellow("SKIP 2 manual actions required:"),
        chalk.red("FAIL 1/5 failed:"),
      ]);
    });

    it("asks which retry strategy to use in English", async () => {
      fakeProvider("winget", "Winget", ["Git.Git"]);
      selectMock.mockResolvedValueOnce("none");
      await runUpdates(
        [{ providerId: "winget", packageId: "Git.Git", pkg: scanned("Git.Git") }],
        consolePorts({ gate: open }),
      );
      expect(printed()).toContain("1 recoverable failure (Winget: 1) — typically an installer hash");
      const question = selectMock.mock.calls[0]![0] as { message: string; choices: unknown[] };
      expect(question.message).toBe("Retry strategy");
      expect(question.choices).toEqual([
        { label: "None — leave the failures", value: "none" },
        expect.objectContaining({ value: "force", label: "--force (bypass the SHA check — safe)" }),
        expect.objectContaining({ value: "force-uninstall" }),
        expect.objectContaining({ value: "reinstall" }),
      ]);
    });
  });
});
