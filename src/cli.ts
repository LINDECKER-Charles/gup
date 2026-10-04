import { exitQuietlyOnBrokenPipe } from "./commands/cli/broken-pipe.js";
import { CLI_MODULES } from "./commands/cli/cli-modules.js";
import { applyStartupLocale } from "./commands/cli/language-module.js";
import { createProgram } from "./commands/cli/program.js";
import { handleFatal } from "./commands/cli/startup.js";

// `gup … | head`: a reader that left ends the run quietly, not with a stack trace.
exitQuietlyOnBrokenPipe(process.stdout);

// Before the program is built: the help, the descriptions and the usage
// errors commander prints are all in the user's language.
applyStartupLocale(process.argv);

// Every command, global option and startup hook comes from a CLI module.
createProgram(CLI_MODULES)
  .parseAsync(process.argv)
  .catch((error: unknown) => handleFatal(error, CLI_MODULES));
