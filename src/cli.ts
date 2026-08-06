import { Command } from "commander";
import chalk from "chalk";
import { adminBatchCommand } from "./commands/admin-batch.js";
import { listCommand } from "./commands/list.js";
import { updateCommand } from "./commands/update.js";
import { doctorCommand } from "./commands/doctor.js";
import { menuCommand } from "./commands/menu.js";
import { setInstallTimeoutSeconds } from "./core/runner.js";
import { gupVersion } from "./core/version.js";

const program = new Command();

program
  .name("gup")
  .description(
    "Gestionnaire unifié de mises à jour. `gup` ouvre un menu interactif ; les sous-commandes (list, update, doctor) court-circuitent le menu.",
  )
  .version(gupVersion());

// Default action: open the interactive menu when no subcommand is given.
program.action(async () => {
  const code = await menuCommand();
  process.exit(code);
});

program
  .command("list")
  .description("Scanne et liste les paquets obsolètes (non-interactif).")
  .option("-p, --provider <ids...>", "Restreint à certains providers")
  .option("--fast", "Skip les scans lents (pwsh-modules, vscode-ext)")
  .option("--json", "Sortie JSON brute")
  .action(async (opts: { provider?: string[]; fast?: boolean; json?: boolean }) => {
    const code = await listCommand({
      ...(opts.provider && { only: opts.provider }),
      ...(opts.fast !== undefined && { fast: opts.fast }),
      ...(opts.json !== undefined && { json: opts.json }),
    });
    process.exit(code);
  });

program
  .command("update [targets...]")
  .description("Mise à jour directe (sans menu). Cibles au format provider:packageId.")
  .option("-a, --all", "Tout mettre à jour")
  .option("-y, --yes", "Skip la confirmation en mode --all")
  .option("-p, --provider <ids...>", "Restreint à certains providers")
  .option("--fast", "Skip les scans lents")
  .option(
    "--timeout <seconds>",
    "Timeout par install en secondes — l'install bloquée est skippée (0 = désactivé)",
  )
  .action(
    async (
      targets: string[],
      opts: { all?: boolean; yes?: boolean; provider?: string[]; fast?: boolean; timeout?: string },
    ) => {
      if (opts.timeout !== undefined) {
        const seconds = Number(opts.timeout);
        if (!Number.isFinite(seconds) || seconds < 0) {
          process.stderr.write(
            `${chalk.red("Error:")} --timeout attend un nombre de secondes >= 0\n`,
          );
          process.exit(2);
        }
        setInstallTimeoutSeconds(seconds);
      }
      const code = await updateCommand({
        ...(targets.length > 0 && { targets }),
        ...(opts.all !== undefined && { all: opts.all }),
        ...(opts.yes !== undefined && { yes: opts.yes }),
        ...(opts.provider && { only: opts.provider }),
        ...(opts.fast !== undefined && { fast: opts.fast }),
      });
      process.exit(code);
    },
  );

program
  .command("doctor")
  .description("Affiche les providers détectés et ceux non installés.")
  .action(async () => {
    const code = await doctorCommand();
    process.exit(code);
  });

// Internal: invoked by the parent gup process after UAC elevation. NOT meant
// for direct use — runs a pre-validated batch from a temp file. Hidden from
// `--help`; the name is deliberately ugly so accidental discovery is hard.
program
  .command("__admin-batch <file>", { hidden: true })
  .description("Internal: run a pre-validated elevated batch from a temp file.")
  .action(async (file: string) => {
    const code = await adminBatchCommand(file);
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  // @inquirer/prompts throws this when the user hits Ctrl+C — handle silently.
  if (err instanceof Error && err.name === "ExitPromptError") {
    process.stdout.write("\n");
    process.exit(130);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${chalk.red("Error:")} ${message}\n`);
  process.exit(1);
});
