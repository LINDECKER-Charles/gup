import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * cabal-install. `cabal outdated` is project-scoped and useless for a global
 * updater; we only surface the `cabal-install` binary itself and let `cabal`
 * rebuild it from Hackage.
 *
 * `cabal --version` prints:
 *   cabal-install version 3.10.2.1
 *   compiled using version 3.10.2.0 of the Cabal library
 */
export class CabalProvider implements Provider {
  readonly id = "cabal";
  readonly displayName = "cabal-install";
  readonly installHint = "https://www.haskell.org/ghcup/";

  async isAvailable(): Promise<boolean> {
    return commandExists("cabal");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("cabal", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/cabal-install\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHackageLatest("cabal-install");
    if (!latest || latest === current) return [];

    return [{ id: "cabal-install", name: "cabal-install", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // Refresh the index, then ask cabal to rebuild itself. Users that manage
    // GHC via ghcup will typically prefer `ghcup install cabal latest` â€” we
    // document the alternative in installHint.
    await run("cabal", ["update"]);
    const res = await runInherit("cabal", [
      "install",
      "cabal-install",
      "--overwrite-policy=always",
    ]);
    return { id: "cabal-install", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("cabal-install")];
  }
}

async function fetchHackageLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://hackage.haskell.org/package/${encodeURIComponent(pkg)}/preferred`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { "normal-version"?: string[] };
    return data["normal-version"]?.[0] ?? null;
  } catch {
    return null;
  }
}
