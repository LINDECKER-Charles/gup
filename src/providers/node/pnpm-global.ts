import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface PnpmOutdatedEntry {
  current: string;
  wanted: string;
  latest: string;
  isDeprecated?: boolean;
  dependencyType?: string;
}

/**
 * pnpm has native JSON output for outdated. We use `add -g <pkg>@latest`
 * (not `update -g`) so cross-major upgrades are applied — `update` is
 * semver-respecting and would skip majors.
 */
export class PnpmGlobalProvider implements Provider {
  readonly id = "pnpm-g";
  readonly displayName = "pnpm (global)";
  readonly installHint = pickInstallHint({
    win32: "winget install pnpm.pnpm",
    fallback: "brew install pnpm",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("pnpm");
  }

  /**
   * Throws when pnpm reports its own failure (an `ERR_PNPM_…` code and no
   * report: a registry answering 503, no network), so the scan shows an
   * error instead of "nothing outdated".
   */
  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await run("pnpm", [
      "outdated",
      "--global",
      "--format",
      "json",
    ]);
    const parsed = parseReport(result.stdout);
    if (parsed === null) {
      const failure = result.failed ? pnpmFailure(`${result.stderr}\n${result.stdout}`) : null;
      if (failure !== null) throw new Error(failure);
      return [];
    }

    return Object.entries(parsed)
      .filter(([, info]) => info.current && info.latest && info.current !== info.latest)
      .map<OutdatedPackage>(([name, info]) => ({
        id: name,
        name,
        current: info.current,
        latest: info.latest,
        ...(info.isDeprecated && { note: "deprecated" }),
      }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const args = packageId === PNPM_PACKAGE ? SELF_UPDATE : ["add", "-g", `${packageId}@latest`];
    const res = await runInherit("pnpm", args);
    return { id: packageId, success: !res.failed };
  }

  /** The others in one `add -g`, then pnpm itself, so it is replaced after it ran the batch. */
  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const others = packages.filter((p) => p.id !== PNPM_PACKAGE);
    const outcomes = new Map<string, UpdateOutcome>();
    if (others.length > 0) {
      const res = await runInherit("pnpm", ["add", "-g", ...others.map((p) => `${p.id}@latest`)]);
      for (const p of others) outcomes.set(p.id, { id: p.id, success: !res.failed });
    }
    if (others.length < packages.length) outcomes.set(PNPM_PACKAGE, await this.update(PNPM_PACKAGE));
    return packages.map((p) => outcomes.get(p.id) ?? { id: p.id, success: false });
  }
}

/**
 * pnpm lists itself among the global packages once `pnpm self-update` put
 * it there, and refuses `pnpm add -g pnpm` (ERR_PNPM_GLOBAL_PNPM_INSTALL,
 * "Use the pnpm self-update command"): it updates through its own command.
 */
const PNPM_PACKAGE = "pnpm";
const SELF_UPDATE = ["self-update"];

/** pnpm's report as an object, or null when stdout holds none. */
function parseReport(stdout: string): Record<string, PnpmOutdatedEntry> | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isObject ? (parsed as Record<string, PnpmOutdatedEntry>) : null;
  } catch {
    return null;
  }
}

const PNPM_ERROR_CODE = /ERR_PNPM_[A-Z0-9_]+/;
/** The glyphs pnpm 10+ draws its errors with (`× message`, `│ continued`). */
const ERROR_BOX_GLYPHS = /^[\s×│╰╭─]+/;

/**
 * The scan error for pnpm's own failure: its code and the message after it,
 * whether on the code's line (` ERR_PNPM_X  message`, before pnpm 10) or on
 * the boxed lines below (`Error: ERR_PNPM_X` then `× message`). Null when
 * pnpm said no such thing.
 */
function pnpmFailure(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.replace(ERROR_BOX_GLYPHS, "").trim())
    .filter((line) => line !== "");
  const index = lines.findIndex((line) => PNPM_ERROR_CODE.test(line));
  if (index < 0) return null;
  const codeLine = lines[index] ?? "";
  const code = PNPM_ERROR_CODE.exec(codeLine)?.[0] ?? "";
  const sameLine = codeLine.slice(codeLine.indexOf(code) + code.length).trim();
  const message = [sameLine, ...lines.slice(index + 1)].filter((part) => part !== "").join(" ");
  return `pnpm outdated a échoué (${code}) : ${message}`;
}
