import {
  inferSourceFromPath,
  resolveBinaryPath,
  type InstallSource,
} from "./install-source.js";
import type { ProviderScanResult } from "./types.js";

/**
 * Wider sense of "who installed this binary" than {@link InstallSource}.
 * Captures the OS-level package managers (scoop/choco/winget) plus the
 * toolchain managers (nvm, fnm, volta, mise, pyenv-win, asdf, proto) that
 * legitimately compete for the same executable. `manual` keeps its meaning
 * from install-source: PATH lookup did not point at any known install root.
 */
export type BinaryOwner =
  | InstallSource
  | "nvm-windows"
  | "nvm"
  | "fnm"
  | "volta"
  | "mise"
  | "asdf"
  | "proto"
  | "pyenv-win"
  | "uv";

/** PATH-first resolution → owning install root. */
export async function detectBinaryOwner(binary: string): Promise<BinaryOwner> {
  const resolved = await resolveBinaryPath(binary);
  if (!resolved) return "manual";
  return inferBinaryOwnerFromPath(resolved);
}

/**
 * Same heuristic shape as `inferSourceFromPath` but covers the toolchain
 * managers too. Falls back to the install-source detector first so the
 * existing scoop/choco/winget paths win when present.
 */
/**
 * Toolchain managers reconnaissables à un segment de chemin, dans l'ordre où
 * ils doivent être testés : `nvm-windows` avant `nvm` (le second est un
 * préfixe du premier), `pyenv-win` avant `pyenv`.
 *
 * Chaque entrée est un prédicat plutôt qu'un simple segment, parce que
 * plusieurs de ces outils ont une racine alternative qui ne suit pas la forme
 * `<sep><nom><sep>`.
 */
const TOOLCHAIN_OWNERS: Array<[BinaryOwner, (lower: string) => boolean]> = [
  // nvm-windows lives under Windows-specific roots (nvm4w, %ProgramData%\nvm).
  // POSIX nvm uses ~/.nvm and is a distinct project — surface it as "nvm" so
  // the actualOwner reported in exclusions is accurate across platforms.
  [
    "nvm-windows",
    (l) =>
      hasSegment(l, "nvm4w") ||
      l.includes("\\programdata\\nvm\\") ||
      l.includes("/programdata/nvm/"),
  ],
  ["nvm", (l) => hasSegment(l, "nvm")],
  ["fnm", (l) => hasSegment(l, "fnm") || hasSegment(l, "fnm-multishells")],
  ["volta", (l) => hasSegment(l, "volta")],
  ["mise", (l) => hasSegment(l, "mise") || l.includes("/.local/share/mise/")],
  ["pyenv-win", (l) => hasSegment(l, "pyenv-win") || hasSegment(l, "pyenv")],
  // uv ships as a cargo-installed binary on both Windows and POSIX:
  //   Windows  %USERPROFILE%\.cargo\bin\uv.exe
  //   POSIX    ~/.cargo/bin/uv
  ["uv", (l) => l.includes("\\.cargo\\bin\\uv") || l.includes("/.cargo/bin/uv")],
  ["asdf", (l) => hasSegment(l, "asdf")],
  ["proto", (l) => hasSegment(l, "proto")],
];

export function inferBinaryOwnerFromPath(path: string): BinaryOwner {
  const lower = path.toLowerCase();
  const fromInstallSource = inferSourceFromPath(lower);
  if (fromInstallSource !== "manual") return fromInstallSource;

  for (const [owner, matches] of TOOLCHAIN_OWNERS) {
    if (matches(lower)) return owner;
  }
  return "manual";
}

/**
 * Match a path component, tolerating the optional leading dot used by tools
 * that live under the user's home (e.g. `~/.volta`, `~/.asdf`) and the
 * Windows-style or POSIX-style separators on both sides.
 */
function hasSegment(lowercasePath: string, segment: string): boolean {
  return (
    lowercasePath.includes(`\\${segment}\\`) ||
    lowercasePath.includes(`\\.${segment}\\`) ||
    lowercasePath.includes(`/${segment}/`) ||
    lowercasePath.includes(`/.${segment}/`)
  );
}

/**
 * Provider id → { package id → binary whose PATH-first owner decides the
 * canonical install. Listed here are the polyglot binaries where parallel
 * installs by competing managers are common AND destructive: surfacing a
 * choco upgrade for `nodejs` when nvm-windows actually owns `node` would
 * shadow the nvm shim and break versioned scripts on the next shell.
 *
 * The table is deliberately small — only entries with a verified, well-known
 * binary name belong here. False negatives (no entry) just preserve current
 * behavior; false positives (wrong binary mapping) would silently hide real
 * upgrades, so we err on the side of omission.
 */
export const POLYGLOT_OWNERSHIP: Record<string, Record<string, string>> = {
  choco: {
    nodejs: "node",
    "nodejs.install": "node",
    "nodejs-lts": "node",
    "nodejs-lts.install": "node",
    python: "python",
    python3: "python",
    python311: "python",
    python312: "python",
    python313: "python",
    python314: "python",
    ruby: "ruby",
    "ruby.devkit": "ruby",
    php: "php",
    git: "git",
    "git.install": "git",
    golang: "go",
    go: "go",
    rust: "rustc",
    rustup: "rustup",
    "docker-desktop": "docker",
    docker: "docker",
  },
  winget: {
    "OpenJS.NodeJS": "node",
    "OpenJS.NodeJS.LTS": "node",
    "Python.Python.3.11": "python",
    "Python.Python.3.12": "python",
    "Python.Python.3.13": "python",
    "Python.Python.3.14": "python",
    "RubyInstallerTeam.Ruby.3.3": "ruby",
    "RubyInstallerTeam.Ruby.3.4": "ruby",
    "Rustlang.Rustup": "rustup",
    "Docker.DockerDesktop": "docker",
    "Git.Git": "git",
    "GoLang.Go": "go",
  },
  scoop: {
    nodejs: "node",
    "nodejs-lts": "node",
    python: "python",
    ruby: "ruby",
    rust: "rustc",
    rustup: "rustup",
    go: "go",
    git: "git",
  },
  // Homebrew is the macOS equivalent of the conflict above: `brew install node`
  // and fnm/volta/mise/asdf all want to own `node` on PATH, and brew's keg-only
  // versioned formulae (node@22, python@3.13) share the same shim name.
  brew: {
    node: "node",
    "node@20": "node",
    "node@22": "node",
    "node@24": "node",
    python: "python3",
    "python@3.11": "python3",
    "python@3.12": "python3",
    "python@3.13": "python3",
    "python@3.14": "python3",
    ruby: "ruby",
    go: "go",
    rust: "rustc",
    rustup: "rustup",
    php: "php",
    "php@8.3": "php",
    "php@8.4": "php",
    git: "git",
  },
};

export interface OwnershipExclusion {
  providerId: string;
  packageId: string;
  binary: string;
  actualOwner: BinaryOwner;
}

/**
 * Drop packages whose canonical binary belongs to a different install
 * source. Returns the filtered scan results alongside the list of dropped
 * entries so the UI can surface them as advisories rather than swallow
 * them silently.
 *
 * The contract is conservative: when the owner cannot be determined
 * (`manual` — binary not on PATH at all) we KEEP the package, because
 * an absent binary is no evidence of conflict. We only drop when the
 * binary IS on PATH and lives somewhere that is NOT the scanning provider.
 */
export async function filterByOwnership(
  results: readonly ProviderScanResult[],
  detect: (binary: string) => Promise<BinaryOwner> = detectBinaryOwner,
): Promise<{ results: ProviderScanResult[]; exclusions: OwnershipExclusion[] }> {
  const exclusions: OwnershipExclusion[] = [];
  const filtered: ProviderScanResult[] = [];
  const detectCached = memoizeOwner(detect);

  for (const r of results) {
    const table = POLYGLOT_OWNERSHIP[r.providerId];
    if (!table) {
      filtered.push(r);
      continue;
    }
    const split = await splitOwned(r, table, detectCached);
    exclusions.push(...split.excluded);
    filtered.push({ ...r, packages: split.kept });
  }
  return { results: filtered, exclusions };
}

/**
 * Cache `detect` results per binary: the default detector shells out to
 * `where`/`which`, and many packageIds map to the same binary (e.g. choco's
 * python / python3 / python311 / python312 all resolve to `python`). Without
 * this cache `scanAll` paid the PATH-probe cost N times per scan.
 */
function memoizeOwner(
  detect: (binary: string) => Promise<BinaryOwner>,
): (binary: string) => Promise<BinaryOwner> {
  const cache = new Map<string, BinaryOwner>();
  return async (binary: string): Promise<BinaryOwner> => {
    const cached = cache.get(binary);
    if (cached !== undefined) return cached;
    const owner = await detect(binary);
    cache.set(binary, owner);
    return owner;
  };
}

/** Sépare les paquets d'un provider entre ceux qu'il possède et les autres. */
async function splitOwned(
  result: ProviderScanResult,
  table: Record<string, string>,
  detect: (binary: string) => Promise<BinaryOwner>,
): Promise<{
  kept: ProviderScanResult["packages"];
  excluded: OwnershipExclusion[];
}> {
  const kept: ProviderScanResult["packages"] = [];
  const excluded: OwnershipExclusion[] = [];
  for (const pkg of result.packages) {
    const exclusion = await classifyPackage(pkg, {
      providerId: result.providerId,
      binary: table[pkg.id],
      detect,
    });
    if (exclusion) excluded.push(exclusion);
    else kept.push(pkg);
  }
  return { kept, excluded };
}

/**
 * Renvoie l'exclusion à enregistrer si un autre gestionnaire possède le
 * binaire, ou null quand le paquet doit être conservé. Un binaire non mappé ou
 * sans propriétaire identifié (`manual`) est toujours conservé : mieux vaut
 * proposer une mise à jour de trop que d'en masquer une vraie.
 */
async function classifyPackage(
  pkg: { id: string },
  ctx: {
    providerId: string;
    binary: string | undefined;
    detect: (binary: string) => Promise<BinaryOwner>;
  },
): Promise<OwnershipExclusion | null> {
  const { providerId, binary, detect } = ctx;
  if (!binary) return null;
  const owner = await detect(binary);
  if (owner === providerId || owner === "manual") return null;
  return { providerId, packageId: pkg.id, binary, actualOwner: owner };
}
