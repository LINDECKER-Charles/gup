import { Command, CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import { CLI_MODULES } from "../../../src/commands/cli/cli-modules.js";
import { localizeCommander } from "../../../src/commands/cli/commander-french.js";
import { createProgram } from "../../../src/commands/cli/program.js";
import { HELP_LABELS } from "../../../src/ui/text/cli-labels.js";

/**
 * The command line speaks French, commander's own words included: every help
 * screen gup prints, and the usage errors commander raises.
 */

/** What commander writes in English when nobody configured it. */
const ENGLISH = [
  /\bUsage:/,
  /\bOptions:/,
  /\bCommands:/,
  /\bArguments:/,
  /display help/,
  /output the version/,
  /\[command\]/,
  /\((?:default|choices|env|preset):/,
];
/** English argument names a usage line could still carry. */
const ENGLISH_PLACEHOLDER = /[<[](?:targets?|seconds|file|level|text|name|period|lines)\b/;

/** Every command a user can reach, the program first; hidden ones excluded. */
function visibleCommands(command: Command): Command[] {
  const children = command.commands.filter((child) => !(child as unknown as { _hidden: boolean })._hidden);
  return [command, ...children.flatMap(visibleCommands)];
}

const pathOf = (command: Command): string =>
  command.parent ? `${pathOf(command.parent)} ${command.name()}` : command.name();

describe("gup's help", () => {
  const commands = visibleCommands(createProgram(CLI_MODULES));

  it("reaches every command", () => {
    expect(commands.map(pathOf)).toEqual(
      expect.arrayContaining(["gup", "gup update", "gup log show", "gup schedule add", "gup report"]),
    );
  });

  it.each(commands.map((command) => [pathOf(command), command] as const))(
    "is French for `%s --help`",
    (_path, command) => {
      const help = command.helpInformation();

      expect(help).toMatch(/^Utilisation : /);
      for (const english of ENGLISH) expect(help).not.toMatch(english);
      expect(help).not.toMatch(ENGLISH_PLACEHOLDER);
    },
  );

  it("names the help option, the help command and --version in French", () => {
    const [gup] = commands;
    const log = commands.find((command) => pathOf(command) === "gup log");

    expect(gup?.helpInformation()).toContain(`-V, --version                 ${HELP_LABELS.version}`);
    expect(gup?.helpInformation()).toContain(`-h, --help                    ${HELP_LABELS.helpOption}`);
    expect(log?.helpInformation()).toContain(`help [commande]   ${HELP_LABELS.helpCommandDescription}`);
    // `gup` itself opens the menu: no `help` subcommand at the top, as before.
    expect(gup?.helpInformation()).not.toMatch(/^\s+help /m);
  });

  it("calls the targets of a command `cibles`, in `gup update` as in `gup schedule add`", () => {
    const usageOf = (path: string) => commands.find((command) => pathOf(command) === path)?.usage();

    expect(usageOf("gup update")).toBe("[options] [cibles...]");
    expect(usageOf("gup schedule add")).toBe("[options] <cibles...>");
  });
});

describe("commander's usage errors", () => {
  /** A program shaped like gup's, localized first, whose errors are captured instead of exiting. */
  function parse(...argv: string[]): string {
    let written = "";
    const program = new Command("gup");
    localizeCommander(program);
    program.exitOverride().configureOutput({ writeErr: (text) => void (written += text) });
    program.action(() => {});
    program.command("list").option("-p, --provider <ids...>", "providers").action(() => {});
    const schedule = program.command("schedule");
    schedule.command("add <cibles...>").action(() => {});
    schedule.command("remove <ids...>").action(() => {});
    program.command("report").option("-o, --out <fichier>", "fichier").action(() => {});
    try {
      program.parse(["node", "gup", ...argv]);
    } catch (error) {
      if (!(error instanceof CommanderError)) throw error;
    }
    return written;
  }

  it.each([
    [["list", "--bogus"], "Erreur : option inconnue '--bogus'\n"],
    [["list", "--provder", "x"], "Erreur : option inconnue '--provder'\n(Vouliez-vous dire --provider ?)\n"],
    [["schedule", "bogus"], "Erreur : commande inconnue 'bogus'\n"],
    [["schedule", "ad"], "Erreur : commande inconnue 'ad'\n(Vouliez-vous dire add ?)\n"],
    [["schedule", "add"], "Erreur : argument obligatoire manquant : 'cibles'\n"],
    [["report", "--out"], "Erreur : l'option '-o, --out <fichier>' attend une valeur\n"],
    [["list", "extra"], "Erreur : trop d'arguments pour 'list' : 0 attendu(s), 1 reçu(s) (extra)\n"],
    [["help", "me"], "Erreur : trop d'arguments : 0 attendu(s), 2 reçu(s) (help, me)\n"],
  ])("words `gup %j` in French", (argv, expected) => {
    expect(parse(...argv)).toBe(expected);
  });
});
