import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface NpmRegistryDistTags {
  latest?: string;
}

interface NpmRegistryResponse {
  "dist-tags"?: NpmRegistryDistTags;
}

/**
 * Expo CLI (the global `expo` binary). Distributed as the npm package `expo`.
 *
 * NOTE: with modern Expo (SDK 46+), the bundled `npx expo` is the recommended
 * entry point and the `expo-cli` package is deprecated. We still surface the
 * legacy global install when present because users keep it on their PATH for
 * existing projects. Pinning the dedicated provider on `expo --version`
 * avoids surfacing the entry for users who don't actually have it installed
 * globally â€” npm-g would only see it if it was `npm i -g`'d.
 */
export class ExpoProvider implements Provider {
  readonly id = "expo";
  readonly displayName = "Expo CLI";
  readonly installHint = "npm install -g expo";

  async isAvailable(): Promise<boolean> {
    return commandExists("expo");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("expo", ["--version"]);
    if (failed) return [];

    const current = stdout.trim().match(/^v?([0-9][\w.+-]*)/)?.[1];
    if (!current) return [];

    const latest = await fetchNpmLatest("expo");
    if (!latest || latest === current) return [];

    return [{ id: "expo", name: "Expo CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("npm", ["install", "-g", "expo@latest"]);
    return { id: "expo", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("expo")];
  }
}

async function fetchNpmLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NpmRegistryResponse;
    return data["dist-tags"]?.latest ?? null;
  } catch {
    return null;
  }
}
