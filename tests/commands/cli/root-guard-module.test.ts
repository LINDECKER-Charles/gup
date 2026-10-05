import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { MODULE_ORDER, type CliModule } from "../../../src/commands/cli/cli-module.js";
import { CLI_MODULES } from "../../../src/commands/cli/cli-modules.js";
import {
  createRootGuardModule,
  isSudoRun,
  rootGuardModule,
} from "../../../src/commands/cli/root-guard-module.js";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { ADMIN_BATCH_COMMAND } from "../../../src/core/elevation.js";
import { useLocale } from "../../support/locale.js";

const ROOT = 0;
const JANE = 501;

/** `sudo gup` from Jane's account: root, with SUDO_UID naming her. */
const UNDER_SUDO = { env: { SUDO_UID: String(JANE) }, uid: () => ROOT };

/**
 * gup's startup with `guard` and a logging module, both as the real ones
 * order them; `started` notes the log's start and the action that ran.
 */
function startup(guard: CliModule) {
  const started: string[] = [];
  const logging: CliModule = {
    id: "journal",
    order: MODULE_ORDER.logging,
    runsInElevatedChild: true,
    beforeAction: () => void started.push("journal"),
  };
  const program = new Command().name("gup").exitOverride();
  for (const name of ["list", ADMIN_BATCH_COMMAND]) {
    program.command(name).action(() => void started.push(name));
  }
  installStartup(program, [logging, guard]);
  const parse = (command: string) => program.parseAsync(["node", "gup", command]);
  return { parse, started };
}

describe("isSudoRun", () => {
  it.each([
    { run: "sudo from a user's account", env: { SUDO_UID: "501" }, uid: ROOT, refused: true },
    { run: "a root shell, a container: root's own home", env: {}, uid: ROOT, refused: false },
    { run: "sudo from root itself", env: { SUDO_UID: "0" }, uid: ROOT, refused: false },
    { run: "`sudo -u jane`: not root", env: { SUDO_UID: "501" }, uid: JANE, refused: false },
    { run: "an unreadable SUDO_UID", env: { SUDO_UID: "jane" }, uid: ROOT, refused: false },
    { run: "an empty SUDO_UID", env: { SUDO_UID: "" }, uid: ROOT, refused: false },
    { run: "Windows, with no uid", env: { SUDO_UID: "501" }, uid: undefined, refused: false },
  ])("$run → $refused", ({ env, uid, refused }) => {
    expect(isSudoRun({ env, uid: () => uid })).toBe(refused);
  });
});

describe("rootGuardModule", () => {
  useLocale("en");

  it("refuses a run under sudo before the log, or anything else, starts", async () => {
    const { parse, started } = startup(createRootGuardModule(UNDER_SUDO));
    await expect(parse("list")).rejects.toThrow(
      /^gup does not run under sudo: .* Run gup without sudo — it asks for your password itself/,
    );
    expect(started).toEqual([]);
  });

  it("lets the elevated batch child through: it is the sudo gup asked for", async () => {
    const { parse, started } = startup(createRootGuardModule(UNDER_SUDO));
    await parse(ADMIN_BATCH_COMMAND);
    expect(started).toEqual(["journal", ADMIN_BATCH_COMMAND]);
  });

  it("lets a run as the user through", async () => {
    const { parse, started } = startup(
      createRootGuardModule({ env: { SUDO_UID: "501" }, uid: () => JANE }),
    );
    await parse("list");
    expect(started).toEqual(["journal", "list"]);
  });

  it("runs first of every module, and is registered", () => {
    const orders = CLI_MODULES.filter((m) => m !== rootGuardModule).map((m) => m.order);
    expect(Math.min(...orders)).toBeGreaterThan(rootGuardModule.order);
    expect(CLI_MODULES).toContain(rootGuardModule);
    expect(rootGuardModule.runsInElevatedChild).toBeUndefined();
  });
});
