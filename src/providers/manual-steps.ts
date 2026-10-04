import { localized } from "../core/i18n/localized.js";

/** Windows' own name for an elevated launch, quoted the way its context menu shows it. */
const RUN_AS_ADMINISTRATOR = {
  en: '"Run as administrator"',
  fr: "« Exécuter en tant qu'administrateur »",
};

/**
 * The steps providers hand the user when gup cannot install or update a tool
 * by itself, in the interface's languages: each step is worded once, here, for
 * every provider that suggests it. Read where a hint, a row or an outcome is
 * built (an `installHint` getter, `listOutdated()`, `update()`), never into a
 * module-level constant or a field: see core/i18n/locale.ts.
 *
 * URLs, file names, commands and menu paths go through untranslated.
 */
export const MANUAL_STEPS = localized({
  en: {
    /** A standalone binary: "Download <its releases page> and replace kind.exe". */
    downloadAndReplace: (url: string, executable: string) =>
      `Download ${url} and replace ${executable}`,
    /** A releases page, or the command of another installer that ships the tool too. */
    downloadOr: (url: string, command: string) => `Download ${url} or \`${command}\``,
    /** What the provider needs, then how to get it: "Install Node.js: https://nodejs.org". */
    install: (tool: string, how: string) => `Install ${tool}: ${how}`,
    /** Two steps in order: "brew install --cask cursor, then Cursor → Command Palette → …". */
    andThen: (first: string, next: string) => `${first}, then ${next}`,
    /** For a sentence that names the elevated launch itself. */
    runAsAdministrator: RUN_AS_ADMINISTRATOR.en,
    /** The sentence that follows the reason an update needs an administrator. */
    restartAsAdministrator: `Restart gup from a terminal opened with ${RUN_AS_ADMINISTRATOR.en}.`,
  },
  fr: {
    downloadAndReplace: (url, executable) => `Télécharger ${url} et remplacer ${executable}`,
    downloadOr: (url, command) => `Télécharger ${url} ou \`${command}\``,
    install: (tool, how) => `Installer ${tool}: ${how}`,
    andThen: (first, next) => `${first}, puis ${next}`,
    runAsAdministrator: RUN_AS_ADMINISTRATOR.fr,
    restartAsAdministrator: `Relancer gup depuis un terminal ${RUN_AS_ADMINISTRATOR.fr}.`,
  },
});
