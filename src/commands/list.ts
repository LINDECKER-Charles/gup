import { scanAll } from "../core/registry.js";
import { scanWithProgress } from "../ui/scan-progress.js";
import { renderScanTable } from "../ui/table.js";

export interface ListOptions {
  only?: string[];
  fast?: boolean;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<number> {
  if (options.json) {
    const results = await scanAll({
      ...(options.only && { only: options.only }),
      ...(options.fast !== undefined && { fast: options.fast }),
    });
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
