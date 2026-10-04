import { Command } from "commander";
import { localized } from "../../core/i18n/localized.js";
import { gupVersion } from "../../core/version.js";
import { HELP_LABELS } from "../../ui/text/cli-labels.js";
import type { CliModule } from "./cli-module.js";
import { localizeCommander } from "./commander-locale.js";
import { installStartup } from "./startup.js";

const PROGRAM_LABELS = localized({
  en: {
    description:
      "Unified update manager. `gup` opens an interactive menu; " +
      "the subcommands below skip the menu.",
  },
  fr: {
    description:
      "Gestionnaire unifié de mises à jour. `gup` ouvre un menu interactif ; " +
      "les sous-commandes ci-dessous court-circuitent le menu.",
  },
});

const VERSION_FLAGS = "-V, --version";

/**
 * gup's command line, assembled but not parsed: in the language startup
 * chose, then every command, global option and startup hook of `modules`.
 * `cli.ts` parses it; tests read its help without running anything.
 */
export function createProgram(modules: readonly CliModule[]): Command {
  const program = new Command();
  // First: the commands the modules add inherit it.
  localizeCommander(program);
  program
    .name("gup")
    .description(PROGRAM_LABELS.description)
    .version(gupVersion(), VERSION_FLAGS, HELP_LABELS.version);
  const context = { modules };
  for (const cliModule of modules) cliModule.register?.(program, context);
  installStartup(program, modules);
  return program;
}
