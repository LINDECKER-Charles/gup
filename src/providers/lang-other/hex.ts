import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Hex â€” the Erlang/Elixir package manager. We update only the Hex archive
 * itself (`mix local.hex --force`); per-project deps live in `mix.exs` and
 * are out of scope for a global updater.
 *
 * `mix hex --version` prints "Hex  v2.0.6 (Elixir 1.16.2) (OTP 26.2.2)".
 * Latest comes from hex.pm's API.
 */
export class HexProvider implements Provider {
  readonly id = "hex";
  readonly displayName = "Hex (Elixir)";
  readonly installHint = "https://elixir-lang.org/install.html";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("mix"))) return false;
    const probe = await run("mix", ["hex", "--version"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("mix", ["hex", "--version"]);
    if (failed) return [];

    const match = stdout.match(/Hex\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchHexLatest("hex");
    if (!latest || latest === current) return [];

    return [{ id: "hex", name: "Hex", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("mix", ["local.hex", "--force"]);
    return { id: "hex", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("hex")];
  }
}

async function fetchHexLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://hex.pm/api/packages/${encodeURIComponent(pkg)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      latest_stable_version?: string;
      latest_version?: string;
    };
    return data.latest_stable_version ?? data.latest_version ?? null;
  } catch {
    return null;
  }
}
