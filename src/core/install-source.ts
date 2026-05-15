import { run, runInherit } from "./runner.js";
import type { UpdateOutcome } from "./types.js";

export type InstallSource = "scoop" | "choco" | "winget" | "manual";

/**
 * Locate a binary in PATH and infer which package manager (if any) owns it
 * by matching well-known install directories.
 */
export async function detectInstallSource(binary: string): Promise<InstallSource> {
  const probe = process.platform === "win32" ? "where" : "which";
  const { stdout, failed } = await run(probe, [binary]);
  if (failed) return "manual";
  const path = stdout.split(/\r?\n/)[0]?.trim().toLowerCase() ?? "";
  if (!path) return "manual";
  return inferSourceFromPath(path);
}

export function inferSourceFromPath(path: string): InstallSource {
  const lower = path.toLowerCase();
  if (lower.includes("\\scoop\\")) return "scoop";
  if (lower.includes("chocolatey")) return "choco";
  if (
    lower.includes("\\winget\\") ||
    lower.includes("\\windowsapps\\") ||
    lower.includes("\\appdata\\local\\programs\\")
  )
    return "winget";
  return "manual";
}

export interface PackageIds {
  scoop?: string;
  choco?: string;
  winget?: string;
}

/**
 * Drive an upgrade through a specific package manager. Used when the source
 * is already known (e.g. JetBrains provider that detected it during scan)
 * and re-probing would be wasteful or incorrect.
 */
export async function runPmUpdate(
  id: string,
  source: InstallSource,
  packageIds: PackageIds,
  manualMessage: string,
): Promise<UpdateOutcome> {
  switch (source) {
    case "scoop":
      if (!packageIds.scoop) break;
      return runDelegated(id, "scoop", ["update", packageIds.scoop], { shell: true });
    case "choco":
      if (!packageIds.choco) break;
      return runDelegated(id, "choco", ["upgrade", packageIds.choco, "-y"]);
    case "winget":
      if (!packageIds.winget) break;
      return runDelegated(id, "winget", [
        "upgrade",
        "--id",
        packageIds.winget,
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ]);
    case "manual":
      break;
  }

  return {
    id,
    success: false,
    skipped: true,
    message: manualMessage,
  };
}

export interface DelegateUpdateOptions {
  id: string;
  /** Binary name to locate (e.g. "terraform") for source detection. */
  binary: string;
  packageIds: PackageIds;
  manualMessage: string;
}

/**
 * Convenience: detect the source from a binary name in PATH and run the
 * corresponding upgrade in one call. Used by providers that don't track
 * the install path themselves (symfony-cli, terraform, pulumi, kubectl).
 */
export async function delegateUpdate(
  options: DelegateUpdateOptions,
): Promise<UpdateOutcome> {
  const source = await detectInstallSource(options.binary);
  return runPmUpdate(options.id, source, options.packageIds, options.manualMessage);
}

async function runDelegated(
  id: string,
  command: string,
  args: string[],
  options: { shell?: boolean } = {},
): Promise<UpdateOutcome> {
  const res = await runInherit(command, args, options);
  return { id, success: !res.failed };
}

export function describeSource(source: InstallSource): string {
  switch (source) {
    case "scoop":
      return "via scoop";
    case "choco":
      return "via choco";
    case "winget":
      return "via winget";
    case "manual":
      return "manuel";
  }
}
