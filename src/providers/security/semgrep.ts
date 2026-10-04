import { existsSync } from "node:fs";
import { posix as posixPath, win32 as winPath } from "node:path";
import { commandExists, run, runInherit, whichFirst } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { localize } from "../../core/i18n/localized.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

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
    const python = await pythonForSemgrep();
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

/**
 * Resolve the python interpreter that owns the `semgrep` entry point currently
 * on PATH. Returns null if the binary or its companion interpreter can't be
 * located — caller surfaces that as a manual skip rather than risking a
 * --user shadow install.
 *
 * - Windows: `<prefix>\Scripts\semgrep.exe`  →  `<prefix>\python.exe`
 * - POSIX:   `<prefix>/bin/semgrep`         →  `<prefix>/bin/python{3,}`
 */
async function pythonForSemgrep(): Promise<string | null> {
  const bin = await whichFirst("semgrep");
  if (!bin) return null;
  // The targeted layout decides the path flavour, not the host's separator:
  // `C:\…\Scripts\semgrep.exe` stays a Windows path even when parsed on a
  // POSIX runner (the tests that mock `process.platform`).
  const isWindows = process.platform === "win32";
  const p = isWindows ? winPath : posixPath;
  const sameDir = p.dirname(bin);
  const parent = p.dirname(sameDir);
  const candidates = isWindows
    ? [p.join(parent, "python.exe"), p.join(sameDir, "python.exe")]
    : [
        p.join(sameDir, "python3"),
        p.join(sameDir, "python"),
        p.join(parent, "bin", "python3"),
        p.join(parent, "bin", "python"),
      ];
  return candidates.find((c) => existsSync(c)) ?? null;
}
