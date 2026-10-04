import { localized } from "../../core/i18n/localized.js";

/**
 * The command line's own words, in the interface's languages, where commander
 * has its own: the help's headings, its built-in option and command,
 * `--version`, and the usage errors gup's commands can raise. Commander only
 * speaks English, so the English catalog keeps commander's wording, and the
 * other languages replace it. The commands' own descriptions live with their
 * modules. Tests import these catalogs.
 */

/** What starts every error line gup or commander prints on stderr. */
export const ERROR_LABELS = localized({
  en: { prefix: "Error:" },
  fr: { prefix: "Erreur :" },
});

export const HELP_LABELS = localized({
  en: {
    /**
     * Commander's headings, by the English heading it passes to `styleTitle`;
     * a heading missing here is printed as commander wrote it.
     */
    titles: {} as Readonly<Record<string, string>>,
    /** The usage's placeholder for a subcommand (`gup log [options] [command]`). */
    commandPlaceholder: "[command]",
    helpOption: "display help for command",
    helpCommand: "help [command]",
    helpCommandDescription: "display help for command",
    version: "output the version number",
  },
  fr: {
    titles: {
      "Usage:": "Utilisation :",
      "Options:": "Options :",
      "Commands:": "Commandes :",
      "Arguments:": "Arguments :",
      "Global Options:": "Options globales :",
    },
    commandPlaceholder: "[commande]",
    helpOption: "affiche l'aide de la commande",
    helpCommand: "help [commande]",
    helpCommandDescription: "affiche l'aide d'une commande",
    version: "affiche le numéro de version",
  },
});

/** Too many operands: for which subcommand (none: gup itself), how many it takes, which came. */
export interface ExcessArguments {
  readonly command?: string;
  readonly expected: string;
  readonly received: string;
  readonly operands: string;
}

/**
 * Commander's usage errors ({@link ERROR_LABELS} goes in front). The English
 * catalog is commander 15's own wording, so an English error reads as
 * commander wrote it, under the interface's prefix.
 */
export const USAGE_ERROR_LABELS = localized({
  en: {
    unknownOption: (flag: string) => `unknown option ${flag}`,
    unknownCommand: (name: string) => `unknown command ${name}`,
    missingArgument: (name: string) => `missing required argument ${name}`,
    optionMissingValue: (flags: string) => `option ${flags} argument missing`,
    tooManyArguments: ({ command, expected, received, operands }: ExcessArguments) =>
      `too many arguments${command === undefined ? "" : ` for ${command}`}. ` +
      `Expected ${expected} argument${expected === "1" ? "" : "s"} ` +
      `but got ${received}: ${operands}.`,
    didYouMean: (candidates: string) => `(Did you mean ${candidates}?)`,
    didYouMeanOneOf: (candidates: string) => `(Did you mean one of ${candidates}?)`,
  },
  fr: {
    unknownOption: (flag) => `option inconnue ${flag}`,
    unknownCommand: (name) => `commande inconnue ${name}`,
    missingArgument: (name) => `argument obligatoire manquant : ${name}`,
    optionMissingValue: (flags) => `l'option ${flags} attend une valeur`,
    tooManyArguments: ({ command, expected, received, operands }) =>
      `trop d'arguments${command === undefined ? "" : ` pour ${command}`} : ` +
      `${expected} attendu(s), ${received} reçu(s) (${operands})`,
    didYouMean: (candidates) => `(Vouliez-vous dire ${candidates} ?)`,
    didYouMeanOneOf: (candidates) => `(Vouliez-vous dire l'un de ${candidates} ?)`,
  },
});
