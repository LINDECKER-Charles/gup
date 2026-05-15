import { run, runInherit } from "./runner.js";
import type { UpdateOutcome } from "./types.js";

export type InstallSource = "scoop" | "choco" | "winget" | "manual";

/**
 * Locate a binary in PATH and infer which package manager (if any) owns it
 * by matching well-known install directories. Used by providers without a
 * self-update mechanism (terraform, pulumi, kubectl, symfony-cli, ...) to
 * route the update through the responsible package manager.
 */
export async function detectInstallSource(binary: string): Promise<InstallSource> {
  const probe = process.platform === "win32" ? "where" : "which";
  const { stdout, failed } = await run(probe, [binary]);
  if (failed) return "manual";
  const path = stdout.split(/\r?\n/)[0]?.trim().toLowerCase() ?? "";
  if (!path) return "manual";
  if (path.includes("\\scoop\\")) return "scoop";
  if (path.includes("chocolatey")) return "choco";
  if (path.includes("\\winget\\") || path.includes("\\windowsapps\\")) return "winget";
  return "manual";
}

export interface DelegateUpdateOptions {
  /** Outcome id (typically the provider id or the package id). */
  id: string;
  /** Binary name to locate (e.g. "terraform"). */
  binary: string;
  /** Mapping of package manager → arguments to use for the upgrade. */
  packageIds: {
    scoop?: string;
    choco?: string;
    winget?: string;
  };
  /** Message shown when the binary is installed manually. */
  manualMessage: string;
}

/**
 * Run an upgrade through the detected install source. Returns a `skipped`
 * outcome (yellow, not red) when the binary was installed manually.
 */
export async function delegateUpdate(
  options: DelegateUpdateOptions,
): Promise<UpdateOutcome> {
  const source = await detectInstallSource(options.binary);
  const pkgs = options.packageIds;

  switch (source) {
    case "scoop":
      if (!pkgs.scoop) break;
      return runDelegated(options.id, "scoop", ["update", pkgs.scoop]);
    case "choco":
      if (!pkgs.choco) break;
      return runDelegated(options.id, "choco", ["upgrade", pkgs.choco, "-y"]);
    case "winget":
      if (!pkgs.winget) break;
      return runDelegated(options.id, "winget", [
        "upgrade",
        "--id",
        pkgs.winget,
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ]);
    case "manual":
      break;
  }

  return {
    id: options.id,
    success: false,
    skipped: true,
    message: options.manualMessage,
  };
}

async function runDelegated(
  id: string,
  command: string,
  args: string[],
): Promise<UpdateOutcome> {
  const res = await runInherit(command, args);
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
