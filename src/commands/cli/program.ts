import { Command } from "commander";
import { gupVersion } from "../../core/version.js";
import { HELP_LABELS } from "../../ui/text/cli-labels.js";
import type { CliModule } from "./cli-module.js";
import { localizeCommander } from "./commander-french.js";
import { installStartup } from "./startup.js";

const DESCRIPTION =
  "Gestionnaire unifié de mises à jour. `gup` ouvre un menu interactif ; " +
  "les sous-commandes ci-dessous court-circuitent le menu.";

/**
 * gup's command line, assembled but not parsed: in French, then every
 * command, global option and startup hook of `modules`. `cli.ts` parses it;
 * tests read its help without running anything.
 */
export function createProgram(modules: readonly CliModule[]): Command {
  const program = new Command();
  // First: the commands the modules add inherit it.
  localizeCommander(program);
  program
    .name("gup")
    .description(DESCRIPTION)
    .version(gupVersion(), HELP_LABELS.versionFlags, HELP_LABELS.version);
  const context = { modules };
  for (const cliModule of modules) cliModule.register?.(program, context);
  installStartup(program, modules);
  return program;
}
