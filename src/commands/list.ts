import { scanAll } from "../core/registry.js";
import { MODULE_ORDER, type CliModule } from "./cli/cli-module.js";
import { recordScan } from "../core/history/store.js";
import { localized } from "../core/i18n/localized.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { renderScanTable } from "../ui/table.js";
import { afterExitNotice } from "../ui/after-exit-notice.js";
import { warnIgnoredProviders } from "./warn-ignored-providers.js";

const LIST_LABELS = localized({
  en: {
    description: "Scans and lists the outdated packages (non-interactive).",
    provider: "Limit to some providers",
    fast: "Skip the slow scans (pwsh-modules, vscode-ext)",
    json: "Raw JSON output",
  },
  fr: {
    description: "Scanne et liste les paquets obsolètes (non-interactif).",
    provider: "Restreint à certains providers",
    fast: "Skip les scans lents (pwsh-modules, vscode-ext)",
    json: "Sortie JSON brute",
  },
});

export interface ListOptions {
  only?: string[];
  fast?: boolean;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<number> {
  // Warnings go to stderr, so `--json` keeps a clean stdout.
  warnIgnoredProviders(options.only);
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
  process.stdout.write(`${renderScanTable(results)}\n${afterExitNotice(results)}`);
  return 0;
}

export const listModule: CliModule = {
  id: "list",
  order: MODULE_ORDER.commands,
  register(program) {
    program
      .command("list")
      .description(LIST_LABELS.description)
      .option("-p, --provider <ids...>", LIST_LABELS.provider)
      .option("--fast", LIST_LABELS.fast)
      .option("--json", LIST_LABELS.json)
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
