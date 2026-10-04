/**
 * The command line's own words (French, the language of the interface) where
 * commander would print English: the help's headings, its built-in option and
 * command, `--version`, and the usage errors gup's commands can raise. The
 * commands' own descriptions live with their modules. Tests import these
 * constants.
 */

/** What starts every error line gup or commander prints on stderr. */
export const ERROR_PREFIX = "Erreur :";

export const HELP_LABELS = {
  /** Commander's headings, by the English heading it passes to `styleTitle`. */
  titles: {
    "Usage:": "Utilisation :",
    "Options:": "Options :",
    "Commands:": "Commandes :",
    "Arguments:": "Arguments :",
    "Global Options:": "Options globales :",
  } as Readonly<Record<string, string>>,
  /** The usage's placeholder for a subcommand (`gup log [options] [commande]`). */
  commandPlaceholder: "[commande]",
  helpFlags: "-h, --help",
  helpOption: "affiche l'aide de la commande",
  helpCommand: "help [commande]",
  helpCommandDescription: "affiche l'aide d'une commande",
  versionFlags: "-V, --version",
  version: "affiche le numéro de version",
} as const;

/** Too many operands: for which subcommand (none: gup itself), how many it takes, which came. */
export interface ExcessArguments {
  readonly command?: string;
  readonly expected: string;
  readonly received: string;
  readonly operands: string;
}

/** Commander's usage errors, worded in French ({@link ERROR_PREFIX} goes in front). */
export const USAGE_ERROR_LABELS = {
  unknownOption: (flag: string) => `option inconnue ${flag}`,
  unknownCommand: (name: string) => `commande inconnue ${name}`,
  missingArgument: (name: string) => `argument obligatoire manquant : ${name}`,
  optionMissingValue: (flags: string) => `l'option ${flags} attend une valeur`,
  tooManyArguments: ({ command, expected, received, operands }: ExcessArguments) =>
    `trop d'arguments${command === undefined ? "" : ` pour ${command}`} : ` +
    `${expected} attendu(s), ${received} reçu(s) (${operands})`,
  didYouMean: (candidates: string) => `(Vouliez-vous dire ${candidates} ?)`,
  didYouMeanOneOf: (candidates: string) => `(Vouliez-vous dire l'un de ${candidates} ?)`,
} as const;
