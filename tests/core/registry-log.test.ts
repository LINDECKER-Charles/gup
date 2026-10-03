import { afterEach, describe, expect, it, vi } from "vitest";

const { filterByOwnershipMock } = vi.hoisted(() => ({ filterByOwnershipMock: vi.fn() }));
vi.mock("../../src/core/ownership.js", () => ({ filterByOwnership: filterByOwnershipMock }));

import { installLogBackend, type LogLevel } from "../../src/core/log/log.js";
import { scanAll } from "../../src/core/registry.js";
import type { Provider } from "../../src/core/types.js";

afterEach(() => {
  installLogBackend(null);
});

const choco: Provider = {
  id: "choco",
  displayName: "Chocolatey",
  isAvailable: async () => true,
  listOutdated: async () => [{ id: "nodejs", current: "20.0.0", latest: "22.0.0" }],
  update: async (id) => ({ id, success: true }),
  updateAll: async () => [],
};

describe("scanAll and the debug log", () => {
  it("records each package the ownership filter hid, and keeps the result shape", async () => {
    const records: Array<[LogLevel, string, unknown]> = [];
    installLogBackend({
      isEnabled: () => true,
      emit: (level, event, data) => records.push([level, event, data]),
    });
    const kept = [{ providerId: "choco", available: true, packages: [] }];
    filterByOwnershipMock.mockResolvedValueOnce({
      results: kept,
      exclusions: [
        { providerId: "choco", packageId: "nodejs", binary: "node", actualOwner: "nvm-windows" },
      ],
    });

    await expect(scanAll({ detected: [choco] })).resolves.toEqual(kept);
    expect(records).toEqual([
      [
        "debug",
        "scan.ownership-excluded",
        { providerId: "choco", packageId: "nodejs", binary: "node", owner: "nvm-windows" },
      ],
    ]);
  });
});
