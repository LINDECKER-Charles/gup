import { scanAll } from "../core/registry.js";
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
