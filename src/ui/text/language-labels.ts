import { localized } from "../../core/i18n/localized.js";
import type { LocaleSource } from "../../core/i18n/resolve-locale.js";

/**
 * The words of the interface language itself: the `gup language` command,
 * its `gup doctor` line and its Options row. A message that names the
 * active language is written in it, so each catalog names its own.
 */
export const LANGUAGE_LABELS = localized({
  en: {
    commandDescription: "Shows the interface language, or sets it: gup language fr",
    codeArgument: "language code: en or fr",
    /** "Language: English (default)". */
    current: (source: string) => `Language: English (${source})`,
    sources: { env: "GUP_LANG", setting: "setting", default: "default" } as Readonly<
      Record<LocaleSource, string>
    >,
    available: (choices: string) => `Available: ${choices}`,
    changeHint: "Change it: gup language <code>",
    saved: "gup now speaks English.",
    envOverrides: (value: string) =>
      `GUP_LANG=${value} is set in this shell: it takes precedence over the setting.`,
    ignoredEnv: (value: string, codes: string) =>
      `GUP_LANG=${value} ignored: gup speaks ${codes}`,
    unknown: (code: string, codes: string) => `unknown language "${code}": choose ${codes}`,
    saveFailed: (reason: string) => `the language could not be saved: ${reason}`,
    diagnosticLabel: "Language",
    /** The doctor line's value: "English (default)". */
    diagnosticValue: (source: string) => `English (${source})`,
    optionLabel: "Language",
    optionHint: "takes effect the next time gup starts",
  },
  fr: {
    commandDescription: "Affiche la langue de l'interface, ou la change : gup language fr",
    codeArgument: "code de langue : en ou fr",
    current: (source) => `Langue : français (${source})`,
    sources: { env: "GUP_LANG", setting: "paramètre", default: "par défaut" },
    available: (choices) => `Disponibles : ${choices}`,
    changeHint: "Pour la changer : gup language <code>",
    saved: "gup parle désormais français.",
    envOverrides: (value) =>
      `GUP_LANG=${value} est défini dans ce shell : il l'emporte sur le paramètre.`,
    ignoredEnv: (value, codes) => `GUP_LANG=${value} ignoré : gup parle ${codes}`,
    unknown: (code, codes) => `langue inconnue « ${code} » : choisir ${codes}`,
    saveFailed: (reason) => `la langue n'a pas pu être enregistrée : ${reason}`,
    diagnosticLabel: "Langue",
    diagnosticValue: (source) => `français (${source})`,
    optionLabel: "Langue",
    optionHint: "s'applique au prochain lancement de gup",
  },
});
