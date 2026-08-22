import { access } from "node:fs/promises";
import path from "node:path";
import { commandExists, isElevated, run, runInherit, whichFirst } from "../core/runner.js";
import { isCorepackShim } from "../core/corepack-ownership.js";
import {
  fetchGitHubReleaseLatest,
  normalizeVersion,
} from "../core/gh-releases.js";
import { delegateUpdate } from "../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../core/types.js";

/**
 * Meta-provider that surfaces self-updates of the package managers themselves
 * (the binaries `gup` orchestrates). Per `docs/guide/providers-catalog.md` § 10:
 * tracks winget, scoop, choco, npm, pnpm, yarn, pip, pipx and gh — plus brew,
 * the same role on macOS/Linuxbrew.
 *
 * Each target advertises its current version via its own `--version` output
 * and compares it against the canonical upstream registry/release feed
 * (npm/PyPI/GitHub Releases). Update paths are intentionally narrow — one
 * documented command per target, no scan-time installer downloads.
 *
 * Out of scope:
 *  - symfony-cli: already covered by `SymfonyCliProvider` (delegated install
 *    source detection). Duplicating here would just produce two identical
 *    rows.
 *  - rustup: `rustup check` already advertises self-updates as a regular
 *    entry, handled by `RustupProvider`.
 *  - JetBrains Toolbox: auto-updates itself, no CLI entry point.
 */
export class SelfProvider implements Provider {
  readonly id = "self";
  readonly displayName = "Self (package managers)";
  /** Per-target HTTP lookups (npm registry / PyPI / GitHub) — gated by --fast. */
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    // Light up as soon as at least one tracked PM is on PATH. Cheap probe:
    // commandExists is a `where`/`which` lookup, fan-out is fine.
    const checks = await Promise.all(
      activeTargets().map((t) => commandExists(t.binary)),
    );
    return checks.some(Boolean);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    // pnpm/yarn shims are owned by Corepack only when the binary on PATH is
    // actually a corepack shim (lives next to `corepack` itself). Standalone
    // installs (e.g. `%LOCALAPPDATA%\pnpm\pnpm.CMD`) win PATH resolution over
    // any corepack shim and are NOT updatable via `corepack prepare`, so we
    // must handle them here via `pnpm self-update` / `npm i -g yarn`.
    const [pnpmOwned, yarnOwned] = await Promise.all([
      isCorepackShim("pnpm"),
      isCorepackShim("yarn"),
    ]);
    const targets = activeTargets().filter((t) => {
      if (t.id === "pnpm" && pnpmOwned) return false;
      if (t.id === "yarn" && yarnOwned) return false;
      return true;
    });
    const results = await Promise.all(
      targets.map(async (t): Promise<OutdatedPackage | null> => {
        if (!(await commandExists(t.binary))) return null;
        const [current, latest] = await Promise.all([t.current(), t.latest()]);
        if (!current || !latest) return null;
        if (normalizeVersion(current) === normalizeVersion(latest)) return null;
        return {
          id: t.id,
          name: t.displayName,
          current,
          latest,
          ...(t.manual && {
            manual: true,
            note: t.manualMessage ?? "manuel",
          }),
        };
      }),
    );
    return results.filter((p): p is OutdatedPackage => p !== null);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const target = activeTargets().find((t) => t.id === packageId);
    if (!target) {
      return { id: packageId, success: false, message: "Cible self inconnue" };
    }
    return target.update();
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) {
      outcomes.push(await this.update(pkg.id));
    }
    return outcomes;
  }
}

interface SelfTarget {
  id: string;
  displayName: string;
  /** Binary probed via PATH lookup. */
  binary: string;
  current: () => Promise<string | null>;
  latest: () => Promise<string | null>;
  update: () => Promise<UpdateOutcome>;
  /** Surface row but mark as manual:true — filtered out of "Update all". */
  manual?: boolean;
  manualMessage?: string;
  /**
   * Platforms the target can exist on. Omitted means "everywhere".
   *
   * Filtering here rather than relying on the PATH probe matters: a target
   * that cannot exist on the running OS would still cost a `where`/`which`
   * spawn per scan, and would light up on the strength of a shim that merely
   * forwards elsewhere (a `brew.cmd` bridging into WSL, say).
   */
  platforms?: readonly NodeJS.Platform[];
}

/** Targets that can exist on the running platform. */
function activeTargets(): SelfTarget[] {
  return TARGETS.filter(
    (t) => !t.platforms || t.platforms.includes(process.platform),
  );
}

async function runStdout(cmd: string, args: string[]): Promise<string> {
  const { stdout, failed } = await run(cmd, args);
  return failed ? "" : stdout;
}

function parseFirstSemver(s: string): string | null {
  // Matches X.Y.Z[.W][-prerelease]; tolerates a leading "v" and any prefix
  // text ("pip 24.0 from ...", "gh version 2.55.0 (...)", ...).
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers, no nested repetition
  const m = s.match(/v?(\d+\.\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?)/);
  return m?.[1] ?? null;
}

async function fetchNpmLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      signal: AbortSignal.timeout(5_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function fetchPypiLatest(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { info?: { version?: string } };
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Python interpreter that hosts a given `pip` shim.
 *
 * Critical: a bare `py` invocation resolves to whichever Python is starred in
 * `py -0` (often the free-threaded build when multiple 3.13 variants are
 * installed), which is NOT necessarily the interpreter behind the `pip.exe`
 * on PATH. Running `py -m pip install -U pip` then targets the wrong site —
 * `pip --version` keeps reporting the old binary because PATH still resolves
 * to the un-updated install. We instead derive the host Python from `pip`'s
 * own location, so discovery and update target the same interpreter.
 *
 * Layout assumed:
 *   Windows  → <root>\Scripts\pip.exe  ↔  <root>\python.exe
 *   POSIX    → <bindir>/pip            ↔  <bindir>/{python3,python}
 */
async function resolvePythonForPip(): Promise<string | null> {
  const pipPath = await whichFirst("pip");
  if (!pipPath) return null;

  // Explicit path flavours rather than the host-dependent `path.*`: a
  // `C:\…\python.exe` stays a Windows path even when the process building it
  // runs on macOS (unit tests mock `process.platform`), and vice versa.
  if (process.platform === "win32") {
    const installRoot = path.win32.dirname(path.win32.dirname(pipPath));
    const python = path.win32.join(installRoot, "python.exe");
    return (await pathExists(python)) ? python : null;
  }

  const binDir = path.posix.dirname(pipPath);
  for (const candidate of ["python3", "python"]) {
    const p = path.posix.join(binDir, candidate);
    if (await pathExists(p)) return p;
  }
  return null;
}

/** Fallback Python launcher when `pip` isn't on PATH (pipx-only setups, …). */
async function resolvePython(): Promise<string | null> {
  if (await commandExists("py")) return "py";
  if (await commandExists("python")) return "python";
  if (await commandExists("python3")) return "python3";
  return null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const TARGETS: SelfTarget[] = [
  // Winget ships no CLI self-update path. App Installer (the package that
  // contains winget.exe) is updated via the Microsoft Store or by sideloading
  // the .msixbundle from GitHub Releases. Reported as manual.
  {
    id: "winget",
    displayName: "Winget",
    binary: "winget",
    manual: true,
    manualMessage:
      "Mise à jour via le Microsoft Store (App Installer) ou https://github.com/microsoft/winget-cli/releases",
    current: async () => parseFirstSemver(await runStdout("winget", ["--version"])),
    latest: async () => fetchGitHubReleaseLatest("microsoft/winget-cli"),
    update: async () => ({
      id: "winget",
      success: false,
      skipped: true,
      message:
        "Mise à jour via le Microsoft Store (App Installer) ou téléchargement manuel.",
    }),
  },

  // `scoop update` is idempotent: pulls scoop's own git repo + every bucket.
  // Version comes from the first "Current Scoop version:" block of the
  // multi-section output.
  {
    id: "scoop",
    displayName: "Scoop",
    binary: "scoop",
    current: async () => {
      const out = await runStdout("scoop", ["--version"]);
      const after = out.split(/Current Scoop version:/i)[1] ?? out;
      return parseFirstSemver(after);
    },
    latest: async () => fetchGitHubReleaseLatest("ScoopInstaller/Scoop"),
    update: async () => {
      const res = await runInherit("scoop", ["update"], { shell: true });
      return { id: "scoop", success: !res.failed };
    },
  },

  // Chocolatey installs system-wide → requires elevation. Mirrors the policy
  // used by ChocoProvider for managed packages.
  {
    id: "choco",
    displayName: "Chocolatey",
    binary: "choco",
    current: async () => parseFirstSemver(await runStdout("choco", ["--version"])),
    latest: async () => fetchGitHubReleaseLatest("chocolatey/choco"),
    update: async () => {
      if (!(await isElevated())) {
        return {
          id: "choco",
          success: false,
          skipped: true,
          message:
            "Chocolatey nécessite un terminal admin. Relancer gup depuis un terminal « Exécuter en tant qu'administrateur ».",
        };
      }
      const res = await runInherit("choco", ["upgrade", "chocolatey", "-y"]);
      return { id: "choco", success: !res.failed };
    },
  },

  // `brew update` is Homebrew's own self-update: it fast-forwards the brew
  // git repo (and every tap index) without touching installed formulae —
  // upgrading those is BrewProvider's job. `brew --version` prints
  // "Homebrew X.Y.Z" on its first line; upstream tags live on Homebrew/brew.
  {
    id: "brew",
    displayName: "Homebrew",
    binary: "brew",
    platforms: ["darwin", "linux"],
    current: async () => {
      const out = await runStdout("brew", ["--version"]);
      // A brew checkout ahead of the last tag reports a git-describe suffix
      // ("4.6.15-56-g1a2b3c4") that no GitHub release carries; keeping it
      // would report a permanent, unfixable drift.
      return parseFirstSemver(out.replace(/-\d+-g[0-9a-f]+/i, ""));
    },
    latest: async () => fetchGitHubReleaseLatest("Homebrew/brew"),
    update: async () => {
      const res = await runInherit("brew", ["update"]);
      return { id: "brew", success: !res.failed };
    },
  },

  {
    id: "npm",
    displayName: "npm",
    binary: "npm",
    current: async () => parseFirstSemver(await runStdout("npm", ["--version"])),
    latest: async () => fetchNpmLatest("npm"),
    update: async () => {
      const res = await runInherit("npm", ["install", "-g", "npm@latest"]);
      return { id: "npm", success: !res.failed };
    },
  },

  // Reached when pnpm isn't a Corepack shim (standalone install or owned by
  // another package manager — see CorepackProvider.listOutdated). Modern pnpm
  // rejects `pnpm add -g pnpm` with ERR_PNPM_GLOBAL_PNPM_INSTALL and points
  // to `pnpm self-update`, which works for standalone installs.
  //
  // Quirk: on Windows, `pnpm self-update` swaps the binary correctly but
  // then exits non-zero while cleaning up its `_tmp_<pid>_0` staging dirs
  // ("Le chemin d'accès spécifié est introuvable"). We compare the resolved
  // version before/after rather than trusting the exit code so this benign
  // cleanup race doesn't surface as a false failure.
  {
    id: "pnpm",
    displayName: "pnpm",
    binary: "pnpm",
    current: async () => parseFirstSemver(await runStdout("pnpm", ["--version"])),
    latest: async () => fetchNpmLatest("pnpm"),
    update: async () => {
      const before = parseFirstSemver(await runStdout("pnpm", ["--version"]));
      const res = await runInherit("pnpm", ["self-update"]);
      const after = parseFirstSemver(await runStdout("pnpm", ["--version"]));
      if (before && after && before !== after) {
        return { id: "pnpm", success: true };
      }
      return { id: "pnpm", success: !res.failed };
    },
  },

  // Yarn modern (>=2) is corepack-managed; classic (1.22.x) is npm-installed.
  // Prefer corepack when available — it covers both streams via the `stable`
  // tag mapping and avoids polluting the npm global prefix.
  {
    id: "yarn",
    displayName: "Yarn",
    binary: "yarn",
    current: async () => parseFirstSemver(await runStdout("yarn", ["--version"])),
    latest: async () => fetchNpmLatest("yarn"),
    update: async () => {
      if (await commandExists("corepack")) {
        const res = await runInherit("corepack", [
          "prepare",
          "yarn@stable",
          "--activate",
        ]);
        return { id: "yarn", success: !res.failed };
      }
      const res = await runInherit("npm", ["install", "-g", "yarn"]);
      return { id: "yarn", success: !res.failed };
    },
  },

  // `pip install -U pip` from within pip itself prints a warning on Windows
  // about replacing a running executable; the documented escape hatch is
  // `python -m pip install -U pip --user`.
  {
    id: "pip",
    displayName: "pip",
    binary: "pip",
    current: async () => parseFirstSemver(await runStdout("pip", ["--version"])),
    latest: async () => fetchPypiLatest("pip"),
    update: async () => {
      // Target the Python that hosts the pip on PATH — see resolvePythonForPip
      // for why a bare `py` is unsafe when multiple 3.x installs coexist.
      const py = (await resolvePythonForPip()) ?? (await resolvePython());
      if (!py) {
        return {
          id: "pip",
          success: false,
          message: "Python introuvable dans le PATH",
        };
      }
      const res = await runInherit(py, [
        "-m",
        "pip",
        "install",
        "--user",
        "-U",
        "--disable-pip-version-check",
        "pip",
      ]);
      return { id: "pip", success: !res.failed };
    },
  },

  // The catalog lists `pipx upgrade-all` but that's the wrong target — it
  // upgrades pipx-managed apps, not pipx itself. `pipx upgrade pipx` is the
  // documented self-update for pipx >= 1.0.
  {
    id: "pipx",
    displayName: "pipx",
    binary: "pipx",
    current: async () => parseFirstSemver(await runStdout("pipx", ["--version"])),
    latest: async () => fetchPypiLatest("pipx"),
    update: async () => {
      const res = await runInherit("pipx", ["upgrade", "pipx"]);
      return { id: "pipx", success: !res.failed };
    },
  },

  // gh ships no `self update` command on Windows — upgrades are delegated to
  // whichever package manager installed it (typically winget).
  {
    id: "gh",
    displayName: "GitHub CLI",
    binary: "gh",
    current: async () => parseFirstSemver(await runStdout("gh", ["--version"])),
    latest: async () => fetchGitHubReleaseLatest("cli/cli"),
    update: async () =>
      delegateUpdate({
        id: "gh",
        binary: "gh",
        packageIds: {
          winget: "GitHub.cli",
          scoop: "gh",
          choco: "gh",
        },
        manualMessage:
          "Télécharger https://github.com/cli/cli/releases et remplacer gh.exe",
      }),
  },
];
