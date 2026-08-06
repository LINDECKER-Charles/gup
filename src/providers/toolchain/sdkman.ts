import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * SDKMAN! — JVM ecosystem version manager (Java, Kotlin, Gradle, sbt, …).
 *
 * Not a binary: `sdk` is a shell function defined by sourcing
 * `$HOME/.sdkman/bin/sdkman-init.sh`. To invoke it from a non-shell host we
 * shell out to bash with the init script sourced.
 *
 * Scope here is the SDKMAN binary itself (`sdk selfupdate`); the SDKs it
 * manages are handled by their respective providers (and would otherwise
 * require parsing `sdk list <candidate>` per tool).
 *
 * Windows is not officially supported by SDKMAN; this provider only activates
 * when ~/.sdkman/bin/sdkman-init.sh exists AND bash is on PATH (Git Bash,
 * WSL passthrough, or native Linux/macOS).
 */
export class SdkmanProvider implements Provider {
  readonly id = "sdkman";
  readonly displayName = "SDKMAN!";
  readonly installHint = "https://sdkman.io/install";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!existsSync(initScript())) return false;
    return commandExists("bash");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const current = await runSdk("sdk version");
    const currentMatch = current.match(/(?:SDKMAN\s+(?:script:|version:)?\s*)?([0-9][\w.+-]*)/i);
    const currentVersion = currentMatch?.[1];
    if (!currentVersion) return [];

    // SDKMAN exposes the latest version through its broadcast API; the
    // /selfupdate endpoint returns plain text "x.y.z".
    let latest: string | null = null;
    try {
      const res = await fetch("https://api.sdkman.io/2/broker/version/sdkman/stable", {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) latest = (await res.text()).trim();
    } catch {
      latest = null;
    }
    if (!latest || latest === currentVersion) return [];

    return [
      {
        id: "sdkman",
        name: "SDKMAN!",
        current: currentVersion,
        latest,
        note: "sdk selfupdate force",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInheritSdk("sdk selfupdate force");
    return { id: "sdkman", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("sdkman")];
  }
}

function initScript(): string {
  return join(homedir(), ".sdkman", "bin", "sdkman-init.sh");
}

async function runSdk(cmd: string): Promise<string> {
  const { stdout, failed } = await run("bash", [
    "-lc",
    `source "${initScript()}" >/dev/null 2>&1 && ${cmd}`,
  ]);
  return failed ? "" : stdout;
}

async function runInheritSdk(cmd: string) {
  return runInherit("bash", [
    "-lc",
    `source "${initScript()}" >/dev/null 2>&1 && ${cmd}`,
  ]);
}
