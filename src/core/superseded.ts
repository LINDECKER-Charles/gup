import type { OutdatedPackage, ProviderScanResult } from "./types.js";

/**
 * The same software listed by two providers, kept with the one that updates
 * it properly. Updating both is never right: whichever runs second finds its
 * row stale — winget then answers "no applicable upgrade" for a Visual Studio
 * the Visual Studio provider has just updated, and its retry tiers offer to
 * uninstall and reinstall it.
 */
interface Supersession {
  /** Whether this row of `providerId` goes… */
  drops(providerId: string, pkg: OutdatedPackage): boolean;
  /** …when the provider that keeps the software scanned it. */
  readonly keeper: string;
  isCovered(keeper: ProviderScanResult): boolean;
}

/** The keeper's scan went through, whatever it found. */
const scannedCleanly = (keeper: ProviderScanResult): boolean =>
  keeper.available && keeper.error === undefined;

/** One provider's row, by its package id. */
interface RowRef {
  readonly provider: string;
  readonly id: string;
}

/**
 * Two rows for the same software, both scanned: `drop` goes once `keep` is
 * listed. While the keeper has no row — up to date by its own reading, or its
 * lookup failed — the other one still offers the update.
 */
function listedTwice(drop: RowRef, keep: RowRef): Supersession {
  return {
    drops: (providerId, pkg) => providerId === drop.provider && pkg.id === drop.id,
    keeper: keep.provider,
    isCovered: (keeper) => keeper.packages.some((pkg) => pkg.id === keep.id),
  };
}

const VISUAL_STUDIO_EDITION =
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested repetition: literals around one optional four-digit year
  /^Microsoft\.VisualStudio\.(?:\d{4}\.)?(?:Community|Professional|Enterprise|BuildTools)(?:\.Preview)?$/;

const SUPERSESSIONS: readonly Supersession[] = [
  // The Visual Studio provider drives the installer of every instance;
  // winget's upgrade of an edition only forwards to that same installer.
  {
    drops: (providerId, pkg) => providerId === "winget" && VISUAL_STUDIO_EDITION.test(pkg.id),
    keeper: "visual-studio",
    isCovered: scannedCleanly,
  },
  // A GitHub CLI winget installed lives in Program Files, where `self` sees
  // no package manager and could only say "download it yourself".
  listedTwice({ provider: "self", id: "gh" }, { provider: "winget", id: "GitHub.cli" }),
  // The Git for Windows provider hands the update to the manager that owns
  // it, winget included, or else runs the built-in updater, which leaves the
  // installer running in the background: winget's row, run after it, failed
  // against that installer, then again on the retry pass.
  listedTwice(
    { provider: "winget", id: "Git.Git" },
    { provider: "git-for-windows", id: "git-for-windows" },
  ),
  // Semgrep installed as a uv or pipx tool: the semgrep provider looks for a
  // Python beside the binary on PATH, finds the tool manager's launcher there,
  // and could only skip with "host Python not found" while the tool's own
  // row updated it.
  listedTwice({ provider: "semgrep", id: "semgrep" }, { provider: "uv-tools", id: "semgrep" }),
  listedTwice({ provider: "semgrep", id: "semgrep" }, { provider: "pipx", id: "semgrep" }),
  // npm and pip list themselves among their global packages, and `self` runs
  // the same upgrade again: the global row stays — npm-g also puts back what
  // an interrupted npm left moved aside.
  listedTwice({ provider: "self", id: "npm" }, { provider: "npm-g", id: "npm" }),
  listedTwice({ provider: "self", id: "pip" }, { provider: "pip", id: "pip" }),
  // pnpm the other way round: both rows run `pnpm self-update`, and only
  // `self` checks that the pnpm on PATH changed. Run after pnpm-g's, it found
  // the version pnpm-g had just installed and failed with "still on PATH".
  listedTwice({ provider: "pnpm-g", id: "pnpm" }, { provider: "self", id: "pnpm" }),
  // A tool Homebrew installed (Starship, Terraform, the Symfony CLI…) is
  // updated by `brew upgrade` whichever row asks for it, and `brew outdated`
  // lists what that command will do: brew's own row is the one to keep, at
  // the version the formula delivers. Both rows ran the same upgrade, so a
  // formula brew could not install failed twice. With no brew row there is
  // nothing to deliver yet — a release the tool's provider reads upstream
  // before the formula packages it — and the provider's row came back after
  // every update, a success that changed nothing.
  {
    drops: (providerId, pkg) => providerId !== "brew" && pkg.installedBy === "brew",
    keeper: "brew",
    isCovered: scannedCleanly,
  },
];

/** A row dropped because another provider keeps its software. */
export interface SupersededRow {
  readonly providerId: string;
  readonly packageId: string;
  readonly keeper: string;
}

/** The scan without the rows another provider updates, and the rows dropped. */
export function dropSuperseded(results: readonly ProviderScanResult[]): {
  readonly results: ProviderScanResult[];
  readonly dropped: SupersededRow[];
} {
  const dropped: SupersededRow[] = [];
  const rules = SUPERSESSIONS.filter((rule) => isCovered(rule, results));
  const kept = results.map((result) => {
    const packages = result.packages.filter((pkg) => {
      const rule = rules.find((candidate) => candidate.drops(result.providerId, pkg));
      if (rule) dropped.push({ providerId: result.providerId, packageId: pkg.id, keeper: rule.keeper });
      return rule === undefined;
    });
    return packages.length === result.packages.length ? result : { ...result, packages };
  });
  return { results: kept, dropped };
}

function isCovered(rule: Supersession, results: readonly ProviderScanResult[]): boolean {
  const keeper = results.find((result) => result.providerId === rule.keeper);
  return keeper !== undefined && rule.isCovered(keeper);
}
