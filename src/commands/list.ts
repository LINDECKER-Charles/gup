import { scanAll } from "../core/registry.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { renderScanTable } from "../ui/table.js";

export interface ListOptions {
  only?: string[];
  fast?: boolean;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<number> {
  const results = options.json
    ? await scanAll({
        ...(options.only && { only: options.only }),
        ...(options.fast !== undefined && { fast: options.fast }),
      })
    : await scanWithProgress({
        ...(options.only && { only: options.only }),
        ...(options.fast !== undefined && { fast: options.fast }),
      });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${renderScanTable(results)}\n`);
  return 0;
}
