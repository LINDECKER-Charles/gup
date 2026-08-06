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
export function inferBinaryOwnerFromPath(path: string): BinaryOwner {
  const lower = path.toLowerCase();
  const fromInstallSource = inferSourceFromPath(lower);
  if (fromInstallSource !== "manual") return fromInstallSource;

  // nvm-windows lives under Windows-specific roots (nvm4w, %ProgramData%\nvm).
  // POSIX nvm uses ~/.nvm and is a distinct project — surface it as "nvm" so
  // the actualOwner reported in exclusions is accurate across platforms.
  if (
    hasSegment(lower, "nvm4w") ||
    lower.includes("\\programdata\\nvm\\") ||
    lower.includes("/programdata/nvm/")
  )
    return "nvm-windows";
  if (hasSegment(lower, "nvm")) return "nvm";
  if (hasSegment(lower, "fnm") || hasSegment(lower, "fnm-multishells")) return "fnm";
  if (hasSegment(lower, "volta")) return "volta";
  if (hasSegment(lower, "mise") || lower.includes("/.local/share/mise/")) return "mise";
  if (hasSegment(lower, "pyenv-win") || hasSegment(lower, "pyenv")) return "pyenv-win";
  // uv ships as a cargo-installed binary on both Windows and POSIX:
  //   Windows  %USERPROFILE%\.cargo\bin\uv.exe
  //   POSIX    ~/.cargo/bin/uv
  if (lower.includes("\\.cargo\\bin\\uv") || lower.includes("/.cargo/bin/uv")) return "uv";
  if (hasSegment(lower, "asdf")) return "asdf";
  if (hasSegment(lower, "proto")) return "proto";
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
  // Cache `detect` results per binary: the default detector shells out to
  // `where`/`which`, and many packageIds map to the same binary (e.g. choco's
  // python / python3 / python311 / python312 all resolve to `python`). Without
  // this cache `scanAll` paid the PATH-probe cost N times per scan.
  const ownerCache = new Map<string, BinaryOwner>();
  const detectCached = async (binary: string): Promise<BinaryOwner> => {
    const cached = ownerCache.get(binary);
    if (cached !== undefined) return cached;
    const owner = await detect(binary);
    ownerCache.set(binary, owner);
    return owner;
  };

  for (const r of results) {
    const table = POLYGLOT_OWNERSHIP[r.providerId];
    if (!table) {
      filtered.push(r);
      continue;
    }
    const kept: typeof r.packages = [];
    for (const pkg of r.packages) {
      const binary = table[pkg.id];
      if (!binary) {
        kept.push(pkg);
        continue;
      }
      const owner = await detectCached(binary);
      if (owner === r.providerId || owner === "manual") {
        kept.push(pkg);
      } else {
        exclusions.push({
          providerId: r.providerId,
          packageId: pkg.id,
          binary,
          actualOwner: owner,
        });
      }
    }
    filtered.push({ ...r, packages: kept });
  }
  return { results: filtered, exclusions };
}
