import ora from "ora";
import { scanAll } from "../core/registry.js";
import { renderScanTable } from "../ui/table.js";

export interface ListOptions {
  only?: string[];
  fast?: boolean;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<number> {
  const spinner = options.json ? null : ora({ text: "scan en cours...", spinner: "line" }).start();
  const results = await scanAll({
    ...(options.only && { only: options.only }),
    ...(options.fast !== undefined && { fast: options.fast }),
  });
  spinner?.stop();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${renderScanTable(results)}\n`);
  return 0;
}
