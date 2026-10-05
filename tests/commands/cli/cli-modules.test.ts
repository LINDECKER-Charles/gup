import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { CLI_MODULES } from "../../../src/commands/cli/cli-modules.js";

/** The program the real `main.ts` builds, without parsing anything. */
function assembled(): Command {
  const program = new Command().name("gup").exitOverride();
  for (const cliModule of CLI_MODULES) cliModule.register?.(program, { modules: CLI_MODULES });
  return program;
}

describe("CLI_MODULES", () => {
  it("lists each module once, sorted by id", () => {
    const ids = CLI_MODULES.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers gup's commands, the elevated batch hidden from the help", () => {
    const program = assembled();
    expect(program.commands.map((c) => c.name()).sort()).toEqual([
      "__admin-batch",
      "__schedule-tick",
      "doctor",
      "language",
      "list",
      "log",
      "report",
      "schedule",
      "update",
    ]);
    const help = program.helpInformation();
    expect(help).toMatch(/\blist\b/);
    expect(help).toMatch(/\bupdate\b/);
    expect(help).toMatch(/\bdoctor\b/);
    expect(help).toMatch(/\bschedule\b/);
    expect(help).not.toContain("__admin-batch");
    expect(help).not.toContain("__schedule-tick");
  });

  it("refuses a bad --timeout with exit 2, before updating anything", async () => {
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(
        assembled().parseAsync(["node", "gup", "update", "--timeout", "bientôt"]),
      ).rejects.toThrow("exit 2");
      expect(String(stderr.mock.calls[0]![0])).toContain("--timeout attend un nombre de secondes");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps the update options scripts rely on", () => {
    const update = assembled().commands.find((c) => c.name() === "update")!;
    expect(update.options.map((o) => o.long)).toEqual([
      "--all",
      "--yes",
      "--provider",
      "--fast",
      "--timeout",
    ]);
  });
});
