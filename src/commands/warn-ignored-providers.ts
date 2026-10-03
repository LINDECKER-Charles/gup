import chalk from "chalk";
import { lookupProvider } from "../core/platform/lookup-provider.js";
import { IGNORED_PROVIDER_LABELS } from "../ui/text/providers-labels.js";

/**
 * One stderr line per `--provider` id gup cannot act on here — unknown, or
 * foreign to this OS — before the scan runs. The scan itself is unchanged
 * (the registry already leaves those ids out); without this, a filter made
 * only of such ids scans nothing and says nothing.
 */
export function warnIgnoredProviders(ids: readonly string[] = []): void {
  for (const id of ids) {
    const lookup = lookupProvider(id);
    if (lookup.isFound) continue;
    const prefix = chalk.yellow(IGNORED_PROVIDER_LABELS.prefix);
    process.stderr.write(`${prefix} ${IGNORED_PROVIDER_LABELS.text(lookup.error)}\n`);
  }
}
