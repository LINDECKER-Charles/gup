import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * `nuget.exe` — the standalone NuGet CLI.
 *
 * Scope is the **binary itself and nothing else**. The packages nuget restores
 * are declared by a project's `.csproj` / `packages.config`: that is repository
 * state, versioned in git and reviewed like code, categorically outside what a
 * machine-wide updater may touch. The global packages folder
 * (`~/.nuget/packages`) is likewise out of scope — it is a download cache keyed
 * by exact version, not a set of installed things that can be "outdated".
 * `dotnet-tools` covers the one nuget-adjacent set that *is* machine-global.
 *
 * No platform gate: nuget.exe runs under Mono on macOS/Linux (the official docs
 * ship an install procedure for it), so the binary probe is the honest test.
 * The Mono caveat only bites at update time — see `update()`.
 *
 * Current version: `nuget help` prints a version banner as its first line.
 * Verified in NuGet.Client rather than from memory: `HelpCommand` overrides
 * `ShouldOutputNuGetVersion => true` (the base class only prints it at detailed
 * verbosity), and `Command.OutputNuGetVersion` formats the `OutputNuGetVersion`
 * resource — `"{0} Version: {1}"` — with the assembly name and
 * `FileVersionInfo.FileVersion`. `{0}` is `NuGet` (the csproj sets
 * `<AssemblyName>NuGet</AssemblyName>`) and that file version carries four
 * components ("7.6.0.7"), which is why comparison goes through
 * `toVersionTriple`.
 *
 * Latest version: NOT GitHub Releases. `NuGet/NuGet.Client` last published a
 * GitHub release in 2016 — `/releases/latest` still answers `3.4.4-rtm`,
 * re-checked against the API while writing this — so `fetchGitHubReleaseLatest`
 * would report every machine on earth as several major versions ahead: a wrong
 * comparison, worse than none. The feed used instead is the documented NuGet V3
 * package base address for `NuGet.CommandLine`, which is exactly the package
 * `update -self` pulls: `SelfUpdater` hardcodes
 * `NuGetCommandLinePackageId = "NuGet.CommandLine"` and, with no `-Source`,
 * `UpdateCommand` targets `NuGetConstants.V3FeedUrl` (nuget.org).
 */
export class NugetProvider implements Provider {
  readonly id = "nuget";
  readonly displayName = "NuGet CLI";
  readonly installHint = pickInstallHint({
    win32:
      "Télécharger https://dist.nuget.org/win-x86-commandline/latest/nuget.exe et l'ajouter au PATH",
    fallback:
      "Nécessite Mono — https://learn.microsoft.com/en-us/nuget/reference/nuget-exe-cli-reference",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("nuget");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const current = await readCurrentVersion();
    if (!current) return [];

    const latest = await fetchNugetCliLatest();
    if (!latest) return [];
    // Numeric, component-wise: "6.9.0" must not read as newer than "6.10.0",
    // and an equal (or ahead) install emits no row at all.
    if (compareTriples(toVersionTriple(current), toVersionTriple(latest)) >= 0) {
      return [];
    }

    return [
      {
        id: "nuget",
        name: "NuGet CLI",
        current,
        latest,
        // Signalé, pas masqué : `manual: true` retirerait la ligne du scan
        // (registry.ts filtre `!pkg.manual`) et l'utilisateur ne saurait jamais
        // que son nuget.exe a vieilli.
        ...(process.platform !== "win32" && {
          note: "sous Mono : update -self non garanti",
        }),
      },
    ];
  }

  /**
   * `nuget update -self` is the documented self-update path ("Updates nuget.exe
   * to the latest version. `-Source` can be used however all other arguments
   * are ignored. If no source is provided, checks nuget.org for updates").
   *
   * Microsoft's note on the `update` page — "does not work with the CLI running
   * under Mono (Mac OSX or Linux)" — is written without qualification, but
   * `UpdateCommand.ExecuteCommandAsync` short-circuits on `-Self` *before* it
   * resolves MSBuild, which is the part that actually breaks under Mono. So the
   * command is attempted everywhere rather than pre-skipped off Windows, and a
   * failure there is reported as a SKIP with the manual procedure instead of a
   * red FAIL the user cannot act on.
   *
   * `-NonInteractive` is a base-`Command` option (it feeds NuGet's credential
   * service), so it applies to `update` too: without it a credential prompt on
   * a misconfigured source would sit there until the runner's install timeout
   * fires, twenty minutes later.
   */
  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nuget", ["update", "-self", "-NonInteractive"]);
    if (!res.failed) return { id: "nuget", success: true };
    return { id: "nuget", ...describeSelfUpdateFailure() };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nuget")];
  }
}

/**
 * Why a failed `update -self` reads differently per platform — see `update()`.
 * Windows gets a plain failure with the cause it almost always has: nuget.exe
 * rewrites itself in place (`SelfUpdater` renames the running exe to `.old`),
 * which a copy under `Program Files` refuses without elevation. `requiresAdmin`
 * is deliberately left off the scan row: gup would then batch every run behind
 * a UAC prompt, including the majority of installs that live in a writable
 * folder and need nothing of the sort.
 */
function describeSelfUpdateFailure(): Omit<UpdateOutcome, "id"> {
  if (process.platform === "win32") {
    return {
      success: false,
      message:
        "nuget.exe se remplace sur place : vérifier les droits d'écriture sur son dossier, ou relancer depuis un terminal administrateur",
    };
  }
  return {
    success: false,
    skipped: true,
    message:
      "`nuget update -self` a échoué sous Mono — retélécharger https://dist.nuget.org/win-x86-commandline/latest/nuget.exe",
  };
}

/**
 * Read the installed version from the help banner.
 *
 * `-ForceEnglishOutput` pins the wording so the banner regex is not at the
 * mercy of the user's locale, but the option only exists since nuget 3.5.
 * The retry is driven by "did we get a version out of it", not merely by the
 * exit status: that covers both a pre-3.5 binary rejecting the unknown option
 * and one that accepts it yet prints something the parser cannot read.
 *
 * `help` is passed first on purpose — the docs warn that `nuget install help`
 * installs a package called "help" from nuget.org.
 */
async function readCurrentVersion(): Promise<string | null> {
  const forced = await run("nuget", ["help", "-ForceEnglishOutput"]);
  const fromForced = forced.failed ? null : parseNugetVersion(forced.stdout);
  if (fromForced) return fromForced;

  const plain = await run("nuget", ["help"]);
  return plain.failed ? null : parseNugetVersion(plain.stdout);
}

/**
 * Pull the version out of `nuget help` output, whose first line is
 * "NuGet Version: 7.6.0.7".
 *
 * The fallback exists for localized builds that translate the banner wording.
 * It anchors on the line *starting with* `NuGet`, not on "the first dotted
 * number anywhere": the format string is `"{0} Version: {1}"` and `{0}` is the
 * assembly name, which no translation touches — every localized target in
 * NuGet.Client's resource catalogue keeps it in front ("{0} Version : {1}" in
 * French, "{0} バージョン: {1}" in Japanese, "{0}, версия: {1}" in Russian).
 * Requiring that prefix is what keeps a stray leading line (a Mono warning, a
 * distro wrapper script printing its own name) from being mistaken for a
 * version, and keeps the rest of the help text — which documents a `-Version`
 * option — out of reach.
 */
export function parseNugetVersion(stdout: string): string | null {
  // eslint-disable-next-line security/detect-unsafe-regex -- every repeat of the inner group must consume a literal ".", so no two iterations can match the same input and there is nothing to backtrack over. safe-regex false positive, same shape as the version patterns in core/runner.ts.
  const banner = stdout.match(/NuGet\s+Version\s*:\s*v?([0-9]+(?:\.[0-9]+)*)/i);
  if (banner?.[1]) return banner[1];

  const firstLine = stdout.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  if (!/^NuGet\b/i.test(firstLine)) return null;
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded {1,3} over a group anchored on a literal "."; same false positive as above.
  const loose = firstLine.match(/([0-9]+(?:\.[0-9]+){1,3})/);
  return loose?.[1] ?? null;
}

/**
 * Reduce a version to its first three numeric components, zero-padded.
 *
 * The two sides of the comparison do not agree on shape: the binary reports a
 * four-part Win32 file version ("7.6.0.7") while nuget.org publishes three-part
 * package versions ("7.6.0"). Compared raw, a perfectly up-to-date install
 * looks outdated forever. Padding rather than truncating keeps "7.6" and
 * "7.6.0" equal.
 */
export function toVersionTriple(version: string): string {
  const parts = version.trim().replace(/^v/i, "").split(".");
  const triple: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = parts[i];
    const parsed = raw === undefined ? 0 : Number.parseInt(raw, 10);
    triple.push(Number.isNaN(parsed) ? 0 : parsed);
  }
  return triple.join(".");
}

/** Numeric ordering of two `toVersionTriple` outputs. */
function compareTriples(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < 3; i += 1) {
    const diff = Number(left[i] ?? 0) - Number(right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Highest stable version in a package base address listing. The listing is
 * documented as "every version available" — ordering unspecified, prereleases
 * and *unlisted* versions included — so both the filtering and the max are done
 * here rather than trusting the last element.
 *
 * One residual difference with `update -self`, which queries the feed with
 * `includeUnlisted: false`: an unlisted version above the newest listed one
 * would show up here and produce a row nuget then declines to act on. The flat
 * container carries no listed/unlisted flag, and `NuGet.CommandLine` has never
 * had such a version; correcting for it would mean a second, less stable
 * endpoint (the search service) for a case that does not occur.
 */
export function pickLatestStable(versions: readonly string[]): string | null {
  let best: string | null = null;
  for (const version of versions) {
    // Anything carrying a `-preview` / `-rc` / `-rtm-final` suffix fails this.
    // eslint-disable-next-line security/detect-unsafe-regex -- fully anchored, and each repeat consumes a literal "."; no ambiguity to backtrack over. safe-regex false positive.
    if (!/^[0-9]+(?:\.[0-9]+)*$/.test(version)) continue;
    if (best === null || compareTriples(toVersionTriple(version), toVersionTriple(best)) > 0) {
      best = version;
    }
  }
  return best;
}

/**
 * NuGet V3 package base address ("flat container"). The base URL is nominally
 * discoverable through the service index; hardcoding nuget.org's is deliberate,
 * since the question asked is specifically "what would `update -self` fetch from
 * nuget.org", not "what does the user's configured feed carry". The id segment
 * must be lowercased, per the documented `{@id}/{LOWER_ID}/index.json` shape.
 */
const FLAT_CONTAINER_INDEX =
  "https://api.nuget.org/v3-flatcontainer/nuget.commandline/index.json";

async function fetchNugetCliLatest(): Promise<string | null> {
  try {
    const res = await fetch(FLAT_CONTAINER_INDEX, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return pickLatestStable(extractVersions(await res.json()));
  } catch {
    return null;
  }
}

/**
 * Narrow the parsed body down to the documented `versions: string[]` field
 * without asserting it. A feed answering something else (an error envelope, an
 * HTML captive portal that still returns 200) then degrades to "no latest
 * known" instead of throwing out of the scan.
 */
function extractVersions(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  if (!("versions" in payload)) return [];
  const versions: unknown = payload.versions;
  if (!Array.isArray(versions)) return [];
  return versions.filter((v): v is string => typeof v === "string");
}
