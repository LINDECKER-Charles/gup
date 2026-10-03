import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The menu runs updates through the shared pipeline on the plain terminal
 * (the "outside" flow): what used to update choco packages one by one —
 * each failing without administrator rights — now batches them behind a
 * single elevation prompt, exactly like `gup update`.
 */
const { providers, runElevatedBatchMock, confirmMock } = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  runElevatedBatchMock: vi.fn(),
  confirmMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: (id: string) => providers.get(id),
  detectAvailableProviders: vi.fn(async () => []),
  ALL_PROVIDERS: [],
}));
vi.mock("../../src/core/elevation.js", () => ({ runElevatedBatch: runElevatedBatchMock }));
vi.mock("../../src/ui/prompts/confirm.js", () => ({ confirm: confirmMock }));
vi.mock("../../src/ui/prompts/select.js", () => ({ select: vi.fn() }));

import { menuController } from "../../src/commands/menu.js";

function choco() {
  const update = vi.fn(async (id: string) => ({ id, success: true }));
  providers.set("choco", {
    id: "choco",
    displayName: "Chocolatey",
    isAvailable: async () => true,
    listOutdated: async () => [],
    update,
    updateAll: async () => [],
  });
  return update;
}

const pkg = (id: string, requiresAdmin = false) => ({
  id,
  current: "1",
  latest: "2",
  ...(requiresAdmin && { requiresAdmin }),
});

beforeEach(() => {
  providers.clear();
  runElevatedBatchMock.mockReset();
  confirmMock.mockReset();
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

describe("menuController.updateOutside", () => {
  it("batches the admin packages behind one elevation prompt and updates the rest in place", async () => {
    const update = choco();
    confirmMock.mockResolvedValueOnce(true);
    runElevatedBatchMock.mockResolvedValueOnce([
      { id: "nodejs", success: true },
      { id: "python", success: true },
    ]);

    const report = await menuController.updateOutside([
      { providerId: "choco", pkg: pkg("nodejs", true) },
      { providerId: "choco", pkg: pkg("fzf") },
      { providerId: "choco", pkg: pkg("python", true) },
    ]);

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(runElevatedBatchMock).toHaveBeenCalledExactlyOnceWith(["choco:nodejs", "choco:python"]);
    expect(update).toHaveBeenCalledExactlyOnceWith("fzf");
    expect(report.entries.map((entry) => [entry.key, entry.outcome.success])).toEqual([
      ["choco:fzf", true],
      ["choco:nodejs", true],
      ["choco:python", true],
    ]);
  });

  it("leaves the admin packages alone when the prompt is declined", async () => {
    const update = choco();
    confirmMock.mockResolvedValueOnce(false);
    await menuController.updateOutside([{ providerId: "choco", pkg: pkg("nodejs", true) }]);
    expect(runElevatedBatchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
