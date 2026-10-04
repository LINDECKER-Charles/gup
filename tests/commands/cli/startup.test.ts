import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliModule, StartupContext } from "../../../src/commands/cli/cli-module.js";
import { handleFatal, installStartup } from "../../../src/commands/cli/startup.js";
import { runTrigger, type RunTrigger } from "../../../src/core/state/run-context.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A program with the command shapes the real one has, and the modules under test. */
function program(modules: readonly CliModule[]) {
  const ran: string[] = [];
  const root = new Command().exitOverride().option("--log-level <level>");
  root.action(() => void ran.push("menu"));
  root.command("update [targets...]").action(() => void ran.push("update"));
  root.command("log").command("export").option("--out <file>").action(() => void ran.push("log export"));
  root.command("__admin-batch <file>").action(() => void ran.push("admin"));
  root.command("__schedule-tick").action(() => void ran.push("tick"));
  installStartup(root, modules);
  const parse = (...args: string[]) => root.parseAsync(["node", "gup", ...args]);
  return { parse, ran };
}

/** A module that notes, in `seen`, when its startup runs, and keeps what it was given. */
function recordingModule(seen: string[], definition: Omit<CliModule, "beforeAction">) {
  const contexts: StartupContext[] = [];
  const cliModule: CliModule = {
    ...definition,
    beforeAction: (context) => {
      seen.push(definition.id);
      contexts.push(context);
    },
  };
  return { cliModule, contexts };
}

describe("installStartup", () => {
  it.each([
    [[], "menu"],
    [["update", "npm-g:x"], "cli"],
  ] as const)("records %j as started by %s", async (args, trigger) => {
    const { parse } = program([]);
    await parse(...args);
    expect(runTrigger()).toBe(trigger);
  });

  it("lets a module name the trigger before any module starts", async () => {
    const triggers: Array<RunTrigger | undefined> = [];
    const scheduler: CliModule = {
      id: "schedule",
      order: 50,
      triggerFor: (path) => (path === "__schedule-tick" ? "schedule" : undefined),
    };
    const logging: CliModule = { id: "journal", order: 10, beforeAction: () => void triggers.push(runTrigger()) };
    await program([scheduler, logging]).parse("__schedule-tick");
    expect(triggers).toEqual(["schedule"]);
  });

  it("runs the modules' startup in order, with the command path and every option", async () => {
    const seen: string[] = [];
    const late = recordingModule(seen, { id: "scheduler", order: 50 });
    const early = recordingModule(seen, { id: "logging", order: 10 });
    const noHook: CliModule = { id: "list", order: 100 };
    const { parse, ran } = program([late.cliModule, noHook, early.cliModule]);
    await parse("--log-level", "debug", "log", "export", "--out", "x.zip");
    expect(seen).toEqual(["logging", "scheduler"]);
    expect(early.contexts[0]).toEqual({
      commandPath: "log export",
      options: { logLevel: "debug", out: "x.zip" },
    });
    expect(ran).toEqual(["log export"]);
  });

  it("starts only the opted-in modules in the elevated child", async () => {
    const seen: string[] = [];
    const settings = recordingModule(seen, { id: "settings", order: 20 });
    const logging = recordingModule(seen, { id: "journal", order: 10, runsInElevatedChild: true });
    const { parse, ran } = program([settings.cliModule, logging.cliModule]);
    await parse("__admin-batch", "C:\\tmp\\batch.json");
    expect(seen).toEqual(["journal"]);
    expect(ran).toEqual(["admin"]);
  });
});

describe("handleFatal", () => {
  function exitCaptured() {
    return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
  }

  it("lets every module hear the crash, then exits 1 with the message", () => {
    exitCaptured();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const onCrash = vi.fn();
    const broken: CliModule = {
      id: "broken",
      order: 1,
      onCrash: () => {
        throw new Error("hook failed");
      },
    };
    const error = new Error("disk on fire");
    expect(() => handleFatal(error, [broken, { id: "journal", order: 10, onCrash }])).toThrow("exit 1");
    expect(onCrash).toHaveBeenCalledWith(error);
    expect(String(stderr.mock.calls[0]![0])).toContain("disk on fire");
  });

  it("exits 130 quietly when the user cancelled a prompt", () => {
    exitCaptured();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(() => handleFatal(new PromptCancelledError(), [])).toThrow("exit 130");
    expect(stdout).toHaveBeenCalledWith("\n");
  });
});
