import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { MODULE_ORDER, type CliModule } from "../../../src/commands/cli/cli-module.js";
import { CLI_MODULES } from "../../../src/commands/cli/cli-modules.js";
import {
  createRootGuardModule,
  isSudoRun,
  rootGuardModule,
  type RootGuardDeps,
} from "../../../src/commands/cli/root-guard-module.js";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { ADMIN_BATCH_COMMAND } from "../../../src/core/elevation.js";
import { useLocale } from "../../support/locale.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const tempDir = useTempDirs();

const ROOT = 0;
const JANE = 501;
/** Neither root nor whoever runs the suite. */
const SOMEONE_ELSE = 4242;

/** A guard with no folder to check, run by `uid` with `env`. */
function guardFor(env: NodeJS.ProcessEnv, uid: number | undefined): RootGuardDeps {
  return { env, uid: () => uid, gupDirs: () => [], ownership: {} };
}

/** `sudo gup` from Jane's account: root, with SUDO_UID naming her. */
const UNDER_SUDO = guardFor({ SUDO_UID: String(JANE) }, ROOT);

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
    const { parse, started } = startup(createRootGuardModule(guardFor({ SUDO_UID: "501" }, JANE)));
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

// Real folders, with another owner simulated: a test cannot chown to someone else.
describe.skipIf(process.platform === "win32")("rootGuardModule's gup doctor line", () => {
  useLocale("en");

  /** A home with gup's folders in it; `foreign` lists what another user owns there. */
  async function home(foreign: readonly string[] = []) {
    const dir = await tempDir("gup-root-guard-");
    const support = join(dir, "Library", "Application Support", "gup");
    mkdirSync(join(support, "history"), { recursive: true });
    writeFileSync(join(support, "history", "2026-08.jsonl"), "");
    const owned = new Set(foreign.map((rel) => join(dir, rel)));
    const ownerOf = (path: string): number | null => {
      if (owned.has(path)) return SOMEONE_ELSE;
      try {
        return lstatSync(path).uid;
      } catch {
        return null;
      }
    };
    const deps: RootGuardDeps = {
      env: {},
      uid: () => lstatSync(dir).uid,
      gupDirs: () => [join(support, "history"), join(support, "locks")],
      ownership: { home: dir, user: "jane", ownerOf },
    };
    return createRootGuardModule(deps);
  }

  it("says gup's folders are yours when they are", async () => {
    expect(await (await home()).diagnostics?.()).toEqual([
      { label: "File ownership", value: "gup's folders are yours", status: "ok" },
    ]);
  });

  it("names the folder another user owns, with the chown that gives it back", async () => {
    const gup = join("Library", "Application Support", "gup");
    const guard = await home([gup, join(gup, "history")]);
    const [line, ...others] = (await guard.diagnostics?.()) ?? [];
    expect(others).toEqual([]);
    expect(line).toMatchObject({ label: "File ownership", status: "warn" });
    expect(line?.value).toMatch(/\/Library\/Application Support\/gup belongs to uid 4242, not to you/);
    expect(line?.value).toContain('sudo chown -R jane "$HOME/Library/Application Support/gup"');
  });

  it("names a file another user owns in a folder that is yours", async () => {
    const month = join("Library", "Application Support", "gup", "history", "2026-08.jsonl");
    const lines = (await (await home([month])).diagnostics?.()) ?? [];
    expect(lines.map((line) => line.status)).toEqual(["warn"]);
    expect(lines[0]?.value).toContain(`"$HOME/${month}"`);
  });
});

describe("rootGuardModule's gup doctor line on Windows", () => {
  it("says nothing: an elevated process leaves no file the user cannot write", async () => {
    const guard = createRootGuardModule({ ...guardFor({}, undefined), gupDirs: () => ["C:\\x"] });
    expect(await guard.diagnostics?.()).toEqual([]);
  });
});
