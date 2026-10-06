import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { localize } from "../../core/i18n/localized.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { pythonBehind } from "../python/python-behind.js";

interface PypiJson {
  info?: { version?: string };
}

/**
 * Semgrep (static analyzer), distributed via pip. We must upgrade in-place
 * inside the Python prefix that owns the `semgrep` binary currently on PATH —
 * not via `pip install --user`. Otherwise the user-site copy is shadowed by
 * the older system-wide binary, `semgrep --version` keeps reporting the old
 * version, and gup re-detects it as outdated forever; each re-run also
 * downgrades transitive deps (jsonschema, mcp, opentelemetry-*) back to
 * Semgrep's pins, creating a churn loop with the pip(user) provider.
 */
export class SemgrepProvider implements Provider {
  readonly id = "semgrep";
  readonly displayName = "Semgrep";
  // Outside Windows, `pip install` usually targets an "externally managed"
  // Python (PEP 668) that refuses the install: the Homebrew formula is the
  // route that works the first time.
  readonly installHint = pickInstallHint({
    win32: "pip install semgrep",
    fallback: "brew install semgrep",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("semgrep");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("semgrep", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchPypiLatest("semgrep");
    if (!latest || latest === current) return [];

    return [{ id: "semgrep", name: "Semgrep", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // Null: a manual skip rather than a `--user` install the old copy would shadow.
    const python = await pythonBehind("semgrep");
    if (!python) {
      return {
        id: "semgrep",
        success: false,
        skipped: true,
        message: localize({
          en:
            "semgrep's host Python not found. Manual update: " +
            "`python -m pip install --upgrade semgrep` from the matching install.",
          fr:
            "Python hôte de semgrep introuvable. Mise à jour manuelle: " +
            "`python -m pip install --upgrade semgrep` depuis l'install correspondante.",
        }),
      };
    }
    const res = await runInherit(python, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--disable-pip-version-check",
      "semgrep",
    ]);
    return { id: "semgrep", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("semgrep")];
  }
}

async function fetchPypiLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PypiJson;
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}
