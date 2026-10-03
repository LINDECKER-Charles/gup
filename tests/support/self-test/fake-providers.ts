import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix } from "node:path";
import { fetchGitHubReleaseLatest } from "../../../src/core/gh-releases.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../../src/core/install-source.js";
import { commandExists, run, runInherit } from "../../../src/core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../../src/core/types.js";

/**
 * Small providers built like real ones (same gup helpers, same fail-soft
 * habits) to exercise the contract harness itself. They are not shipped and
 * are no substitute for the real providers' contract cases.
 */

abstract class SelfTestProvider implements Provider {
  abstract readonly id: string;
  readonly displayName = "Self-test provider";

  abstract isAvailable(): Promise<boolean>;
  abstract listOutdated(): Promise<OutdatedPackage[]>;
  abstract update(packageId: string): Promise<UpdateOutcome>;

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

/** A single binary released on GitHub, upgraded through its package manager (collapsed). */
export class ReleaseToolProvider extends SelfTestProvider {
  readonly id = "rtool";

  async isAvailable(): Promise<boolean> {
    return commandExists("rtool");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("rtool", ["--version"]);
    const current = failed ? undefined : /rtool v?(\d+\.\d+\.\d+)/.exec(stdout)?.[1];
    if (!current) return [];
    const latest = await fetchGitHubReleaseLatest("acme/rtool");
    if (!latest || latest === current) return [];
    const source = await detectInstallSource("rtool");
    return [{ id: "rtool", current, latest, note: describeSource(source) }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "rtool",
      binary: "rtool",
      packageIds: { scoop: "rtool", brew: "rtool" },
      manualMessage: "Télécharger rtool",
    });
  }

  override async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.length === 0 ? [] : [await this.update("rtool")];
  }
}

interface ListedPackage {
  readonly name?: unknown;
  readonly current?: unknown;
  readonly latest?: unknown;
}

function toRow(entry: ListedPackage): OutdatedPackage | null {
  const { name, current, latest } = entry;
  const isValid = [name, current, latest].every(
    (field) => typeof field === "string" && field !== "",
  );
  if (!isValid || current === latest) return null;
  return { id: name as string, current: current as string, latest: latest as string };
}

/** Parse `lm outdated --json`; anything unexpected yields no rows. */
function parseListing(stdout: string): OutdatedPackage[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry: ListedPackage) => toRow(entry)).filter((row) => row !== null);
  } catch {
    return [];
  }
}

/** A package manager with a JSON listing and one upgrade per package (per-package). */
export class ListManagerProvider extends SelfTestProvider {
  readonly id: string = "lm";

  async isAvailable(): Promise<boolean> {
    return commandExists("lm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("lm", ["outdated", "--json"]);
    return failed ? [] : parseListing(stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const result = await runInherit("lm", ["upgrade", packageId]);
    return { id: packageId, success: !result.failed };
  }
}

/** The same manager, upgrading everything in one call (one-batch). */
export class BatchManagerProvider extends ListManagerProvider {
  override readonly id = "lm-batch";

  override async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const result = await runInherit("lm", ["upgrade", ...packages.map((pkg) => pkg.id)]);
    return packages.map((pkg) => ({ id: pkg.id, success: !result.failed }));
  }
}

/** Reads a JSON state file from the home directory; updates are manual (skipped). */
export class StateFileProvider extends SelfTestProvider {
  readonly id = "statefile";

  private file(): string {
    return posix.join(homedir(), ".statefile", "state.json");
  }

  async isAvailable(): Promise<boolean> {
    try {
      await readFile(this.file(), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      return parseListing(await readFile(this.file(), "utf8"));
    } catch {
      return [];
    }
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return { id: packageId, success: false, skipped: true, message: "Mettre à jour à la main" };
  }
}

/** Looks every row up over HTTP but forgets to declare itself `slow`. */
export class PerRowLookupProvider extends ListManagerProvider {
  override readonly id = "lm-lookup";

  override async listOutdated(): Promise<OutdatedPackage[]> {
    const rows = await super.listOutdated();
    for (const row of rows) await fetch(`https://registry.test/${row.id}`).catch(() => undefined);
    return rows;
  }
}

/** Parses without guarding anything: the fault sweep must catch it. */
export class FragileProvider extends SelfTestProvider {
  readonly id = "fragile";

  async isAvailable(): Promise<boolean> {
    return commandExists("fragile");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("fragile", ["outdated"]);
    const parsed = JSON.parse(stdout) as { name: string; current: string; latest: string }[];
    return parsed.map(({ name, current, latest }) => ({ id: name, current, latest }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    await runInherit("fragile", ["upgrade", packageId]);
    // Ignores the exit code: the install sweep must catch it.
    return { id: packageId, success: true };
  }
}
