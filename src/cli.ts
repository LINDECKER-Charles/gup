import { CLI_MODULES } from "./commands/cli/cli-modules.js";
import { createProgram } from "./commands/cli/program.js";
import { handleFatal } from "./commands/cli/startup.js";

// Every command, global option and startup hook comes from a CLI module.
createProgram(CLI_MODULES)
  .parseAsync(process.argv)
  .catch((error: unknown) => handleFatal(error, CLI_MODULES));
