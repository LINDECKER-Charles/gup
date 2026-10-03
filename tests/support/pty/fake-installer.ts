import { runInherit } from "../../../src/core/runner.js";
import type { Provider } from "../../../src/core/types.js";

/**
 * A provider whose `update()` does what real ones do: one `runInherit` per
 * package, the outcome read from the exit code. With the PTY sink routed, the
 * install runs in the run view's pane — on a fake node-pty in the UI suites,
 * on a real pseudo-terminal in the integration suite.
 */
export interface InstallerOptions {
  readonly id: string;
  readonly displayName: string;
  /** The command each update runs; default `essai-installer <packageId> [--force]`. */
  readonly command?: (packageId: string) => readonly [string, string[]];
  /** Failures of these packages may be retried with another strategy. */
  readonly retryable?: readonly string[];
}

export function installerProvider(options: InstallerOptions): Provider {
  const commandOf =
    options.command ?? ((packageId: string) => ["essai-installer", [packageId]] as const);
  return {
    id: options.id,
    displayName: options.displayName,
    isAvailable: async () => true,
    listOutdated: async () => [],
    async update(packageId, updateOptions) {
      const [command, args] = commandOf(packageId);
      const force = updateOptions?.force ? ["--force"] : [];
      const result = await runInherit(command, [...args, ...force]);
      if (result.exitCode === 0) return { id: packageId, success: true };
      return {
        id: packageId,
        success: false,
        message: `code de sortie ${result.exitCode}`,
        ...(options.retryable?.includes(packageId) && { retryable: true }),
      };
    },
    updateAll: async () => [],
  };
}
