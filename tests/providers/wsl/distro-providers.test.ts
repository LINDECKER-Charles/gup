import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/core/types.js";
import { WslNixProvider } from "../../../src/providers/wsl/wsl-nix.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandAnswer } from "../../support/system/types.js";
import {
  APT,
  BREW,
  type CountingManager,
  distrosMachine,
  DNF,
  FLATPAK,
  managedDistro,
  PACMAN,
} from "./distros.cases.js";

/**
 * What the six WSL distribution providers share: they exist only when WSL
 * lists a distribution, and a count they cannot trust is no row.
 */

const DISTRO_PROVIDERS: readonly (readonly [string, () => Provider])[] = [
  ["wsl-apt", APT.create],
  ["wsl-brew", BREW.create],
  ["wsl-dnf", DNF.create],
  ["wsl-flatpak", FLATPAK.create],
  ["wsl-nix", () => new WslNixProvider()],
  ["wsl-pacman", PACMAN.create],
];

describe("WSL distribution providers", () => {
  it.each(DISTRO_PROVIDERS)("%s stays hidden when WSL lists no distribution", async (_id, create) => {
    await system.load(distrosMachine([]));
    await expect(create().isAvailable()).resolves.toBe(false);
  });

  const COUNTERS: readonly (readonly [string, CountingManager])[] = [
    ["apt", APT],
    ["brew", BREW],
    ["flatpak", FLATPAK],
  ];
  const UNTRUSTED_COUNTS: readonly (readonly [string, CommandAnswer])[] = [
    ["fails", { exitCode: 1 }],
    ["is not a number", { stdout: "oops\n" }],
    ["is zero", { stdout: "0\n" }],
  ];

  const untrusted = COUNTERS.flatMap(([label, manager]) =>
    UNTRUSTED_COUNTS.map(([why, count]) => ({ label, why, manager, count })),
  );

  it.each(untrusted)(
    "$label lists nothing for a distribution whose count $why",
    async ({ manager, count }) => {
      await system.load(distrosMachine([managedDistro(manager, "Ubuntu", count)]));
      await expect(manager.create().listOutdated()).resolves.toEqual([]);
    },
  );
});
