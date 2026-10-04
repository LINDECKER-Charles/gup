import { commandsAfterExit, SELF_UPDATE_TEXT } from "../core/self-update.js";
import type { ProviderScanResult } from "../core/types.js";

/**
 * What gup prints as it exits when its last scan held updates it could only
 * leave for afterwards (gup itself on Windows): the commands to run now, each
 * on its own line so it can be copied whole. Empty when there are none.
 */
export function afterExitNotice(scans: readonly ProviderScanResult[]): string {
  const commands = commandsAfterExit(scans);
  if (commands.length === 0) return "";
  const lines = ["", SELF_UPDATE_TEXT.afterExit, ...commands.map((command) => `  ${command}`)];
  return `${lines.join("\n")}\n`;
}
