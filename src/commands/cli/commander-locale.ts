import { Help, type Command, type HelpConfiguration } from "commander";
import {
  ERROR_LABELS,
  HELP_LABELS,
  USAGE_ERROR_LABELS as ERRORS,
} from "../../ui/text/cli-labels.js";

/**
 * Commander, in the interface's active language: the help's headings and
 * usage placeholder, the built-in `-h` option and `help` command, and the
 * usage errors it prints (unknown option or command, missing argument or
 * value, too many arguments, with its "did you mean"). Commander only has
 * English; its errors are rewritten line by line from the wording of the
 * pinned version — in English, back into that same wording — and a line no
 * rule knows keeps its text under the interface's prefix.
 *
 * Runs on the program before any command is added, once startup has chosen
 * the language: commander copies the help option, the help command and the
 * help and output configuration into each command when it creates it.
 */
export function localizeCommander(program: Command): void {
  program
    .helpOption(HELP_FLAGS, HELP_LABELS.helpOption)
    .helpCommand(HELP_LABELS.helpCommand, HELP_LABELS.helpCommandDescription)
    // Only commands with subcommands list it (`gup log`, `gup schedule`):
    // `gup` itself opens the menu, as before.
    .helpCommand(false)
    .configureHelp(LOCALIZED_HELP)
    .configureOutput({ outputError: (text, write) => write(localizedUsageError(text)) });
}

type Rewrite = readonly [RegExp, (match: RegExpExecArray) => string];

const HELP_FLAGS = "-h, --help";
const ENGLISH_PREFIX = /^error: /;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested repetition; the input is commander's own one-line message, not user data
const SUGGESTION = /^\(Did you mean (one of )?(.+)\?\)$/;
// The messages of commander 15's `unknownOption`, `unknownCommand`,
// `missingArgument`, `optionMissingArgument` and `_excessArguments`.
const REWRITES: readonly Rewrite[] = [
  [/^error: unknown option (.+)$/, ([, flag = ""]) => ERRORS.unknownOption(flag)],
  [/^error: unknown command (.+)$/, ([, name = ""]) => ERRORS.unknownCommand(name)],
  [/^error: missing required argument (.+)$/, ([, name = ""]) => ERRORS.missingArgument(name)],
  [/^error: option (.+) argument missing$/, ([, flags = ""]) => ERRORS.optionMissingValue(flags)],
  [
    // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested repetition; matched against commander's own message
    /^error: too many arguments(?: for (\S+))?\. Expected (\d+) arguments? but got (\d+): (.*)\.$/,
    ([, command, expected = "", received = "", operands = ""]) =>
      ERRORS.tooManyArguments({
        ...(command !== undefined && { command }),
        expected,
        received,
        operands,
      }),
  ],
];

const BASE_HELP = new Help();

/** Read when the help is printed, so the labels are those of the language startup chose. */
const LOCALIZED_HELP: HelpConfiguration = {
  styleTitle: (title) => HELP_LABELS.titles[title] ?? title,
  commandUsage: (command) =>
    BASE_HELP.commandUsage(command).replace("[command]", HELP_LABELS.commandPlaceholder),
};

/** Commander's error text (one message, maybe a suggestion line), in the active language. */
function localizedUsageError(text: string): string {
  return text.split("\n").map(localizedLine).join("\n");
}

function localizedLine(line: string): string {
  const suggestion = SUGGESTION.exec(line);
  if (suggestion) {
    const [, oneOf, candidates = ""] = suggestion;
    return oneOf ? ERRORS.didYouMeanOneOf(candidates) : ERRORS.didYouMean(candidates);
  }
  for (const [pattern, reword] of REWRITES) {
    const match = pattern.exec(line);
    if (match) return `${ERROR_LABELS.prefix} ${reword(match)}`;
  }
  return line.replace(ENGLISH_PREFIX, `${ERROR_LABELS.prefix} `);
}
