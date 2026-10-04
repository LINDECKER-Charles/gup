import { describe, expect, it } from "vitest";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { LINODE_CLI, OCI_CLI, pipCliMachine, pipUpgradeArgv } from "./self-updating.cases.js";

/**
 * The Linode and Oracle Cloud CLIs share their pip route: the first launcher
 * on PATH among python, py, pip and pip3 upgrades the package into the user
 * site; with none of them, gup cannot upgrade it.
 */

const LAUNCHERS = [
  ["py", ["py", "-m", "pip"]],
  ["pip", ["pip"]],
  ["pip3", ["pip3"]],
] as const;

describe.each([LINODE_CLI, OCI_CLI])("$id through pip", (cli) => {
  it.each(LAUNCHERS)("falls back to %s when the launchers before it are absent", async (launcher, argv) => {
    await system.load(pipCliMachine(cli, [launcher]));
    await expect(cli.create().update(cli.id)).resolves.toEqual({ id: cli.id, success: true });
    expect(installArgvs()).toEqual([pipUpgradeArgv(argv, cli.id)]);
  });

  it("is skipped, running nothing, without any pip launcher", async () => {
    await system.load(pipCliMachine(cli, []));
    await expect(cli.create().update(cli.id)).resolves.toEqual({
      id: cli.id,
      success: false,
      skipped: true,
      message: "pip/python introuvable",
    });
    expect(installArgvs()).toEqual([]);
  });
});
