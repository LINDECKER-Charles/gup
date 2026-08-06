import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * R packages (CRAN). We restrict to the user's library tree — leaving the
 * system tree to whatever installed R (admin scope). The `old.packages()`
 * built-in returns a matrix with `Package`, `Installed`, `ReposVer` columns.
 *
 * We emit one CSV row per package via Rscript so parsing stays portable.
 */
export class RPackagesProvider implements Provider {
  readonly id = "R-packages";
  readonly displayName = "R (CRAN)";
  // The historical CRAN link only serves Windows binaries, so everywhere else
  // we point at the Homebrew formula — which also ships Rscript.
  readonly installHint = pickInstallHint({
    win32: "https://cran.r-project.org/bin/windows/base/",
    fallback: "brew install r",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    return commandExists("Rscript");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const script = [
      "op <- tryCatch(old.packages(lib.loc = .libPaths()[1]), error = function(e) NULL)",
      "if (!is.null(op) && nrow(op) > 0) {",
      "  for (i in seq_len(nrow(op))) {",
      '    cat(sprintf("%s\\t%s\\t%s\\n", op[i, "Package"], op[i, "Installed"], op[i, "ReposVer"]))',
      "  }",
      "}",
    ].join("; ");

    const { stdout, failed } = await run("Rscript", [
      "--vanilla",
      "-e",
      script,
    ]);
    if (failed) return [];

    const out: OutdatedPackage[] = [];
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split("\t");
      const [name, current, latest] = parts;
      if (!name || !current || !latest || current === latest) continue;
      out.push({ id: name, name, current, latest });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    if (!/^[A-Za-z][A-Za-z0-9.]*$/.test(packageId)) {
      return { id: packageId, success: false };
    }
    const res = await runInherit("Rscript", [
      "--vanilla",
      "-e",
      `install.packages('${packageId}', lib = .libPaths()[1], repos = 'https://cloud.r-project.org')`,
    ]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("Rscript", [
      "--vanilla",
      "-e",
      "update.packages(lib.loc = .libPaths()[1], ask = FALSE, repos = 'https://cloud.r-project.org')",
    ]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
