import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix as posixPath } from "node:path";
import pLimit from "p-limit";
import {
  fetchGitHubReleaseLatest,
  normalizeVersion,
} from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Mint (yonaskolb/Mint) — builds Swift Package Manager executables and
 * symlinks them into its link directory (`MINT_LINK_PATH`, default
 * `~/.mint/bin`), which users put on $PATH. Those symlinks are the machine-wide
 * Swift tooling (SwiftLint, XcodeGen, swiftformat…) and are squarely gup's
 * remit.
 *
 * Deliberately OUT of scope:
 *  - **A project's `Mintfile`.** `mint outdated` and `mint bootstrap` both
 *    operate on the Mintfile in the current directory: that is repository
 *    state, versioned alongside the code and owned by the project, not by the
 *    machine. Bumping it is a commit, not a maintenance chore.
 *  - **Unlinked cache entries.** `mint run` and `mint install --no-link` leave
 *    built versions in the cache without exposing them on $PATH, and mint
 *    keeps every previously installed version around. Only the version marked
 *    `*` by `mint list` is reachable as a command, so only that one is
 *    reported — and upgrading it re-links, which is what the user expects.
 *  - **Non-GitHub packages.** Mint records the clone URL, so a GitLab or
 *    self-hosted package has no cheap "latest" signal here and is dropped
 *    rather than guessed at.
 *  - **Bare `mint install <repo>`.** Mint's `resolvePackage()` reads any
 *    `Mintfile` sitting in the current directory, so a version-less install
 *    launched from a Swift project silently installs that project's pin —
 *    a downgrade. When the tag cannot be resolved the update is *skipped*
 *    instead, never guessed.
 *
 * Scan shape: `mint list` gives the package basename and its installed
 * versions but never the owner, so the owner comes from mint's own
 * `metadata.json` (a git-URL → cache-directory map). Latest version is one
 * GitHub release lookup per package, fanned out under a concurrency cap.
 *
 * Everything parsed or spawned here is pinned to upstream v0.18.0 source:
 * `Cache.list` (the indented tree), `Mint.output()` (the 🌱-prefixed banner),
 * `Mint.metadataPath` (`<MINT_PATH>/metadata.json`) and `InstallCommand`
 * (`link = !noLink`, i.e. an install re-links globally by default).
 */
export class MintProvider implements Provider {
  readonly id = "mint";
  readonly displayName = "Mint (Swift)";
  readonly installHint = pickInstallHint({
    win32: "Indisponible sur Windows — https://github.com/yonaskolb/Mint",
    fallback: "brew install mint",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    // Mint needs a Swift toolchain and ships no Windows support.
    if (process.platform === "win32") return false;
    try {
      if (!(await commandExists("mint"))) return false;
      // `mint` is also the binary name of the unrelated mint-lang toolchain,
      // and of nothing on a Linux Mint box — only this Mint answers `list`
      // with its own banner, so a wrong `mint` on $PATH can never produce rows.
      const probe = await run("mint", ["list"]);
      return !probe.failed && MINT_LIST_BANNER.test(probe.stdout);
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    try {
      return await scanLinkedPackages();
    } catch {
      // A provider that throws aborts the whole scan; an unreadable cache or a
      // wedged spawn must degrade to "nothing to report" instead.
      return [];
    }
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    // The contract hands update() an id and nothing else, so the tag is
    // re-resolved here. Without it the only remaining form is the bare
    // `mint install <repo>`, which resolves its version from the Mintfile in
    // the current directory — see the header note.
    const tag = await resolveLatestTag(packageId);
    if (!tag) {
      return {
        id: packageId,
        success: false,
        skipped: true,
        message: `dernière version introuvable sur GitHub (réseau ou quota d'API) — réessayer plus tard, ou lancer « mint install ${packageId}@<tag> » à la main`,
      };
    }
    return installPackage(packageId, tag);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    // No bulk verb in mint, and each install is a full source build — running
    // them sequentially keeps the compiler output readable and the machine
    // usable. The tag already came back with the row, so no extra HTTP call.
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) {
      outcomes.push(
        pkg.latest.length > 0
          ? await installPackage(pkg.id, pkg.latest)
          : await this.update(pkg.id),
      );
    }
    return outcomes;
  }
}

/**
 * Present in both branches of `Mint.listPackages()`: "No mint packages
 * installed" and "Installed mint packages:". Both are written to stdout
 * through `output()`, which prefixes them with "🌱 ". Neither string is
 * localised upstream.
 */
const MINT_LIST_BANNER = /mint packages/i;

/** One GitHub release lookup per linked package; cap the fan-out. */
const HTTP_CONCURRENCY = 5;

const NOTE_UNVERSIONED =
  "réf. git non versionnée (branche ou SHA) : la mise à jour épinglera un tag";

export interface MintListEntry {
  /** Package name as `mint list` renders it: the repo basename, no owner. */
  name: string;
  /** Full git URL — only printed when two packages share a basename. */
  gitRepo?: string;
  /** Version whose executables are symlinked into mint's link dir, if any. */
  linkedVersion?: string;
}

interface MintTarget {
  /** GitHub "owner/repo", also the row id. */
  repo: string;
  current: string;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

async function scanLinkedPackages(): Promise<OutdatedPackage[]> {
  const { stdout, failed } = await run("mint", ["list"]);
  if (failed) return [];

  const targets = await resolveTargets(parseMintList(stdout));
  if (targets.length === 0) return [];

  const limit = pLimit(HTTP_CONCURRENCY);
  const rows = await Promise.all(targets.map((t) => limit(() => resolveRow(t))));
  return rows.filter((r): r is OutdatedPackage => r !== null);
}

/**
 * One package's release lookup. Isolated in its own try/catch so a single
 * rejected request cannot reject the surrounding `Promise.all` and take the
 * whole scan down with it.
 */
async function resolveRow(target: MintTarget): Promise<OutdatedPackage | null> {
  const latest = await resolveLatestTag(target.repo);
  if (!latest) return null;
  return buildRow(target, latest);
}

/**
 * Raw tag, `v` kept: it is handed back to git as a ref on upgrade
 * (`git clone -b <version>` in Mint.install), so a `v`-prefixed tag must keep
 * its `v`.
 */
async function resolveLatestTag(repo: string): Promise<string | null> {
  try {
    return await fetchGitHubReleaseLatest(repo, { stripVPrefix: false });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// `mint list` parsing
// ---------------------------------------------------------------------------

// `  SwiftLint` or, on a basename collision, `  SwiftLint (https://…/x.git)`.
// Name and optional suffix are matched in two passes rather than one pattern
// with an optional quantified group, which safe-regex reads as nested
// repetition.
const PACKAGE_LINE = /^ {2}(\S+)(.*)$/;
const PACKAGE_GIT_REPO = /^ \((\S+)\)$/;
// `    - 0.59.1 (swiftlint) *` — trailing group holds executables and the
// global-link marker.
const VERSION_LINE = /^ {4}- (\S+)(.*)$/;

/**
 * `mint list` is a two-level indented tree, not one line per package:
 *
 *   🌱 Installed mint packages:
 *     SwiftLint
 *       - 0.59.1 (swiftlint) *
 *     XcodeGen
 *       - 2.42.0
 *       - 2.43.0 *
 *
 * Two spaces introduce a package, four a version. A `*` anywhere in a version's
 * trailing group means at least one of its executables is linked globally
 * (upstream renders the partially-linked case as `(a *, b)`).
 */
export function parseMintList(stdout: string): MintListEntry[] {
  const entries: MintListEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const version = VERSION_LINE.exec(line);
    if (version) {
      applyVersionLine(entries[entries.length - 1], version);
      continue;
    }
    const pkg = parsePackageLine(line);
    if (pkg) entries.push(pkg);
  }
  return entries;
}

/**
 * A two-space line is a package unless it carries a suffix that is not the
 * parenthesised git URL — anything else at that indent is not something this
 * parser understands, and inventing a package from it would produce a row
 * pointing at nothing.
 */
function parsePackageLine(line: string): MintListEntry | null {
  const match = PACKAGE_LINE.exec(line);
  const name = match?.[1];
  if (!name) return null;
  const tail = (match?.[2] ?? "").trimEnd();
  if (tail.length === 0) return { name };
  const gitRepo = PACKAGE_GIT_REPO.exec(tail)?.[1];
  return gitRepo ? { name, gitRepo } : null;
}

/**
 * Mint guarantees a single linked version per package ("only one linked
 * version can be used at a time"), so a later match simply wins rather than
 * needing a conflict rule.
 */
function applyVersionLine(
  entry: MintListEntry | undefined,
  match: RegExpExecArray,
): void {
  const version = match[1];
  const trailing = match[2] ?? "";
  if (!entry || !version || !trailing.includes("*")) return;
  entry.linkedVersion = version;
}

/**
 * Turn parsed list entries into resolvable GitHub targets. The metadata file
 * is only read when at least one linked package exists, so a machine with mint
 * installed but nothing linked costs no I/O.
 */
async function resolveTargets(entries: MintListEntry[]): Promise<MintTarget[]> {
  const linked = entries.filter((e) => e.linkedVersion !== undefined);
  if (linked.length === 0) return [];

  const index = await readMintRepoIndex();
  const targets: MintTarget[] = [];
  for (const entry of linked) {
    const gitUrl = entry.gitRepo ?? index.get(entry.name.toLowerCase());
    const current = entry.linkedVersion;
    const repo = gitUrl ? toGitHubRepo(gitUrl) : null;
    if (repo && current) targets.push({ repo, current });
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Row shape + version ordering
// ---------------------------------------------------------------------------

/**
 * `current` — installed ref is at or ahead of the latest release, no row.
 * `outdated` — ordinary numeric bump.
 * `unversioned` — installed ref is a branch or a SHA: not orderable, reported
 * with a note because pinning it to a tag is a real (and one-way) change.
 */
export type MintVerdict = "current" | "outdated" | "unversioned";

/**
 * Rows are only emitted for a genuine forward move. Mint pins whatever git ref
 * it was given, and GitHub's "latest release" excludes prereleases, so a plain
 * string difference is not enough: an installed `1.10.0` against a latest
 * `1.9.0` would otherwise be advertised as an upgrade and silently downgrade
 * the user's toolchain.
 */
function buildRow(target: MintTarget, latest: string): OutdatedPackage | null {
  const verdict = compareInstalled(target.current, latest);
  if (verdict === "current") return null;
  return {
    id: target.repo,
    name: target.repo,
    current: target.current,
    latest,
    ...(verdict === "unversioned" && { note: NOTE_UNVERSIONED }),
  };
}

/**
 * `current` is whatever git ref mint checked out: a tag, a branch name
 * (mint falls back to `master` for repos without usable tags) or a SHA. Only
 * the first shape can be ordered; the other two are reported whenever they
 * differ from the latest tag, because pinning them to a release is a real
 * change even though it is not a numeric bump.
 */
export function compareInstalled(current: string, latest: string): MintVerdict {
  const installed = parseVersion(current);
  const available = parseVersion(latest);
  if (!installed || !available) {
    return normalizeVersion(current) === normalizeVersion(latest)
      ? "current"
      : "unversioned";
  }
  return compareVersions(available, installed) > 0 ? "outdated" : "current";
}

interface ParsedVersion {
  core: number[];
  prerelease: string;
}

// One leading digit followed by a single bounded `[\d.]` class rather than a
// repeated `(?:\.\d+)*` group: no nested repetition, so the match is provably
// linear and safe-regex has nothing to flag. 64 characters covers datestamp
// tags and any segment count a Swift package has ever shipped.
const VERSION_SHAPE = /^[vV]?(\d[\d.]{0,63})(.*)$/;

/**
 * Numeric-segment parse, deliberately tolerant: a trailing `-beta.2` marks a
 * prerelease, any other tail (`.RELEASE`, `+build`) is ignored rather than
 * making the whole tag unorderable.
 */
function parseVersion(raw: string): ParsedVersion | null {
  const match = VERSION_SHAPE.exec(raw.trim());
  const core = match?.[1];
  if (!core) return null;
  const tail = match?.[2] ?? "";
  const segments = core
    .split(".")
    .filter((n) => n.length > 0)
    .map((n) => Number.parseInt(n, 10));
  if (segments.length === 0) return null;
  return {
    core: segments,
    prerelease: tail.startsWith("-") ? tail.slice(1) : "",
  };
}

/** Segment-wise numeric ordering, so 1.10 sorts above 1.9. */
function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  const width = Math.max(a.core.length, b.core.length);
  for (let i = 0; i < width; i++) {
    const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  // Semver rule: a release outranks any prerelease of the same core.
  if (a.prerelease === "") return 1;
  if (b.prerelease === "") return -1;
  return a.prerelease > b.prerelease ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * `mint install owner/repo@tag` is the whole upgrade path: mint has no
 * `upgrade` verb, and `InstallCommand` links by default (`link = !noLink`), so
 * an install re-links the new version globally over the previous symlink.
 *
 * `-o/--overwrite` is deliberately not passed: mint only prompts when the link
 * dir already holds a symlink it did not create, and answering "yes" for the
 * user would clobber a foreign binary. `runInherit` streams the prompt to the
 * terminal and its wall-clock timeout bounds a wedged answer.
 */
async function installPackage(repo: string, tag: string): Promise<UpdateOutcome> {
  try {
    const res = await runInherit("mint", ["install", `${repo}@${tag}`]);
    if (res.failed) {
      return {
        id: repo,
        success: false,
        message: `échec de « mint install ${repo}@${tag} »`,
      };
    }
    return { id: repo, success: true };
  } catch {
    return { id: repo, success: false, message: "impossible de lancer mint" };
  }
}

// ---------------------------------------------------------------------------
// Owner recovery from mint's metadata.json
// ---------------------------------------------------------------------------

/**
 * `mint list` prints only the repo basename, so the owner has to come from
 * mint's own metadata file, which maps each clone URL to its cache directory.
 * The first candidate that yields anything wins; an empty map just means every
 * package gets dropped, never a failed scan.
 */
async function readMintRepoIndex(): Promise<Map<string, string>> {
  for (const file of metadataCandidates()) {
    const urls = await readMetadataUrls(file);
    if (urls.length > 0) return indexByBasename(urls);
  }
  return new Map();
}

/**
 * `MINT_PATH` overrides the cache root; otherwise `~/.mint` is the current
 * default (MintCLI.swift) and `/usr/local/lib/mint` the one installs from
 * v0.9.1 and earlier still carry. `metadata.json` sits at the root of that
 * directory in every version. POSIX joins throughout — the provider never runs
 * on Windows, so there is no win32 branch to get wrong.
 */
function metadataCandidates(): string[] {
  const custom = process.env["MINT_PATH"];
  const roots =
    custom && custom.length > 0
      ? [expandHome(custom)]
      : [posixPath.join(homedir(), ".mint"), "/usr/local/lib/mint"];
  return roots.map((root) => posixPath.join(root, "metadata.json"));
}

/**
 * Mint resolves its paths through PathKit's `absolute()`, which expands `~`.
 * A `MINT_PATH` written with a literal tilde (never passed through a shell)
 * would otherwise resolve to nothing here and silently empty the scan.
 */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? posixPath.join(homedir(), path.slice(2)) : path;
}

async function readMetadataUrls(file: string): Promise<string[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only read of mint's own metadata.json; the path is homedir() or $MINT_PATH joined with a hardcoded basename, i.e. the user's own directory — same trust boundary as the process itself.
    const raw = await readFile(file, "utf8");
    return extractPackageUrls(JSON.parse(raw));
  } catch {
    // Missing file, unreadable file, truncated JSON — all mean "no owner
    // information", which drops the rows instead of failing the scan.
    return [];
  }
}

/**
 * `Mint.Metadata` is `{ "packages": { "<git url>": "<cache dir>" } }`. Read
 * structurally rather than through a cast: the file is on disk and nothing
 * guarantees a hand-edited or half-written copy still has that shape.
 */
function extractPackageUrls(parsed: unknown): string[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const packages = (parsed as { packages?: unknown }).packages;
  if (typeof packages !== "object" || packages === null) return [];
  return Object.keys(packages);
}

/**
 * Ambiguous basenames are dropped rather than guessed at: `mint list` spells
 * the git URL out on the package line exactly when two packages collide, so
 * the caller already holds an unambiguous answer for those.
 */
function indexByBasename(gitUrls: string[]): Map<string, string> {
  const firstSeen = new Map<string, string | null>();
  for (const url of gitUrls) {
    const key = gitBasename(url).toLowerCase();
    firstSeen.set(key, firstSeen.has(key) ? null : url);
  }
  const index = new Map<string, string>();
  for (const [key, url] of firstSeen) {
    if (url !== null) index.set(key, url);
  }
  return index;
}

/** Mirrors Mint's own PackageReference.name: last path component, minus `.git`. */
function gitBasename(gitUrl: string): string {
  const last = gitUrl.replace(/\/+$/, "").split("/").pop() ?? gitUrl;
  return last.replace(/\.git$/i, "");
}

/**
 * Scheme, the `git@` SSH user, then the host — anchored at the start of the
 * string. Matching `github.com` *anywhere* instead would accept a self-hosted
 * URL that merely contains the substring
 * (`https://git.corp/mirrors/github.com/owner/repo.git`) and turn it into a
 * GitHub slug, i.e. a release lookup for somebody else's repository.
 *
 * `git` is the only SSH user GitHub accepts, and credentials embedded in an
 * https URL are a CI artefact rather than something mint writes into its
 * metadata — so no general userinfo is allowed here. The cost of being wrong
 * about that is a dropped row, never a request to the wrong repository.
 *
 * Schemes are spelled out rather than written `https?`: an optional quantifier
 * nested inside the optional group is what safe-regex counts as star height 2.
 */
const GITHUB_PREFIX = /^(?:(?:https|http|ssh|git):\/\/)?(?:git@)?github\.com[/:]/i;

/** `<owner>/<repo>`, with the `.git` suffix and trailing slash mint may store. */
const GITHUB_SLUG =
  /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99}?)(?:\.git)?\/?$/;

/**
 * Accepts every shape mint stores — `https://github.com/owner/repo.git`,
 * `git@github.com:owner/repo.git`, `ssh://git@github.com/owner/repo`, or the
 * bare form — and returns null for any other host, which is how non-GitHub
 * packages get filtered out.
 */
export function toGitHubRepo(gitUrl: string): string | null {
  const host = GITHUB_PREFIX.exec(gitUrl);
  if (!host) return null;
  const slug = GITHUB_SLUG.exec(gitUrl.slice(host[0].length));
  const owner = slug?.[1];
  const repo = slug?.[2];
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}
