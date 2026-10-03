import { Command } from "commander";
import { CLI_MODULES } from "./commands/cli/cli-modules.js";
import { handleFatal, installStartup } from "./commands/cli/startup.js";
import { gupVersion } from "./core/version.js";

const program = new Command();

program
  .name("gup")
  .description(
    "Gestionnaire unifié de mises à jour. `gup` ouvre un menu interactif ; " +
      "les sous-commandes (list, update, doctor) court-circuitent le menu.",
  )
  .version(gupVersion());

// Every command, global option and startup hook comes from a CLI module.
const context = { modules: CLI_MODULES };
for (const cliModule of CLI_MODULES) cliModule.register?.(program, context);
installStartup(program, CLI_MODULES);

program.parseAsync(process.argv).catch((error: unknown) => handleFatal(error, CLI_MODULES));
