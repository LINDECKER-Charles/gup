import { describe, expect, it } from "vitest";
import { CargoProvider } from "../../../src/providers/rust/cargo.js";
import { system } from "../../support/system/fake-system.js";
import { cargoMachine } from "./rust.cases.js";

/**
 * cargo has no outdated listing of its own: gup needs the cargo-update
 * plugin, and reads its table loosely.
 */

describe("CargoProvider.isAvailable", () => {
  it("stays hidden when cargo is there but the cargo-update plugin is not", async () => {
    const missing = "error: no such command: `install-update`";
    await system.load(cargoMachine({ exitCode: 101, stderr: missing }));
    await expect(new CargoProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("CargoProvider.listOutdated", () => {
  it("skips blank, separator, short, current and non-version rows", async () => {
    const stdout = [
      "Package      Installed  Latest   Needs update",
      "----         ---------  ------   ------------",
      "",
      "tooshort row",
      "---- another separator inside the body ----",
      "ripgrep      skip       14.0.0   14.0.0   No",
      "fd-find      skip       v8.0.0   v9.0.0   Yes",
      "weird-name   skip       1.2.3    notaversion Yes",
      "good         skip       1.2.3    2.0.0    Yes",
    ].join("\n");
    await system.load({
      platform: "linux",
      bin: { cargo: "/home/u/.cargo/bin/cargo" },
      commands: [{ argv: ["cargo", "install-update", "-l"], stdout }],
    });
    await expect(new CargoProvider().listOutdated()).resolves.toEqual([
      { id: "fd-find", name: "fd-find", current: "v8.0.0", latest: "v9.0.0" },
      { id: "good", name: "good", current: "1.2.3", latest: "2.0.0" },
    ]);
  });
});
