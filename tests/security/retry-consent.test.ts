import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Consent before a destructive retry (testing gap F5). `--force` bypasses the
 * installer hash check; the two other tiers uninstall the current version.
 * None of them may run without an explicit choice: never under `-y`, and
 * with prompts only the tier the user picked, each tier offered once.
 */
const { providers, selectMock } = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  selectMock: vi.fn(),
}));
vi.mock("../../src/core/registry.js", () => ({
  getProvider: (id: string) => providers.get(id),
  ALL_PROVIDERS: [],
}));
vi.mock("../../src/core/history/store.js", () => ({ recordUpdate: vi.fn() }));
vi.mock("../../src/ui/prompts/select.js", () => ({ select: selectMock }));
vi.mock("../../src/ui/prompts/confirm.js", () => ({ confirm: vi.fn(async () => true) }));

import { runUpdates } from "../../src/core/update/update-pipeline.js";
import { consolePorts } from "../../src/ui/update-console.js";

const open = { isAbortRequested: () => false };

/** A winget whose updates keep failing with a hash mismatch, until told otherwise. */
function failingWinget() {
  const update = vi.fn(async (id: string) => ({
    id,
    success: false,
    retryable: true,
    message: "hash mismatch",
  }));
  providers.set("winget", {
    id: "winget",
    displayName: "Winget",
    isAvailable: async () => true,
    listOutdated: async () => [],
    update,
    updateAll: async () => [],
  });
  return update;
}

const requests = [{ providerId: "winget", packageId: "Git.Git" }];

beforeEach(() => {
  providers.clear();
  selectMock.mockReset();
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

describe("retry consent", () => {
  it("never retries under -y, whatever the failure says", async () => {
    const update = failingWinget();
    await runUpdates(requests, consolePorts({ gate: open, yes: true }));
    expect(update).toHaveBeenCalledExactlyOnceWith("Git.Git");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("retries nothing when the user answers none", async () => {
    const update = failingWinget();
    selectMock.mockResolvedValueOnce("none");
    await runUpdates(requests, consolePorts({ gate: open }));
    expect(update).toHaveBeenCalledOnce();
  });

  it("runs only the tier picked, then offers the remaining ones only", async () => {
    const update = failingWinget();
    selectMock.mockResolvedValueOnce("force-uninstall").mockResolvedValueOnce("none");
    await runUpdates(requests, consolePorts({ gate: open }));
    expect(update.mock.calls).toEqual([
      ["Git.Git"],
      ["Git.Git", { force: true, uninstallPrevious: true }],
    ]);
    const offered = selectMock.mock.calls.map(([question]) =>
      question.choices.map((choice: { value: string }) => choice.value),
    );
    expect(offered).toEqual([
      ["none", "force", "force-uninstall", "reinstall"],
      ["none", "force", "reinstall"],
    ]);
    expect(selectMock.mock.calls[0]![0]).toMatchObject({ default: "none" });
  });

  it("stops asking once every tier was tried", async () => {
    const update = failingWinget();
    selectMock
      .mockResolvedValueOnce("force")
      .mockResolvedValueOnce("force-uninstall")
      .mockResolvedValueOnce("reinstall");
    await runUpdates(requests, consolePorts({ gate: open }));
    expect(selectMock).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledTimes(4);
  });
});
