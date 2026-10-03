import { scanAll } from "../core/registry.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";
import { recordScan } from "../core/history/store.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { renderScanTable } from "../ui/table.js";

export interface ListOptions {
  only?: string[];
  fast?: boolean;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<number> {
  if (options.json) {
    // The JSON branch bypasses scanWithProgress (no spinner on a piped
    // stdout), so it is the one scan path that has to log for itself.
    const startedAt = Date.now();
    const results = await scanAll({
      ...(options.only && { only: options.only }),
      ...(options.fast !== undefined && { fast: options.fast }),
    });
    recordScan({ results, durationMs: Date.now() - startedAt, options });
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  }

  const { results } = await scanWithProgress({
    ...(options.only && { only: options.only }),
    ...(options.fast !== undefined && { fast: options.fast }),
  });
  process.stdout.write(`${renderScanTable(results)}\n`);
  return 0;
}

export const listModule: CliModule = {
  id: "list",
  order: MODULE_ORDER.commands,
  register(program) {
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
  },
};
