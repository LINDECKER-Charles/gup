import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { delegateUpdate } from "../../core/install-source.js";
import type { PackageIds } from "../../core/install-source.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

const DOWNLOAD_PAGE = "https://dotnet.microsoft.com/download";

/**
 * Machine-readable index of every .NET channel, published by Microsoft.
 *
 * The legacy `dotnetcli.blob.core.windows.net` host still answers 200, but the
 * blob endpoint is the one Microsoft has been migrating away from; the builds
 * host is what the current release-metadata links point at, so that is what we
 * ask. Fields consumed here (`channel-version`, `latest-sdk`, `support-phase`,
 * `release-type`) were read back off the live document, not assumed.
 */
const RELEASES_INDEX_URL =
  "https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json";

interface ReleaseChannel {
  "channel-version"?: string;
  "latest-sdk"?: string;
  "support-phase"?: string;
  "release-type"?: string;
}

interface ReleasesIndex {
  "releases-index"?: ReleaseChannel[];
}

/**
 * The .NET SDK itself — what `dotnet --list-sdks` reports. Deliberately
 * disjoint from {@link DotnetToolsProvider}, which tracks the global tools
 * installed *through* the SDK and never the SDK underneath them.
 *
 * **Scope: one row, for the installed channel only.** Microsoft's release index
 * lists every channel side by side (8.0, 9.0, 10.0, an 11.0 preview…), so
 * comparing the installed SDK against the newest entry would render a major
 * migration as if it were a patch. .NET majors are separate products with
 * their own support window, their own installer and their own package id in
 * every package manager; moving between them is a decision, not a routine
 * upgrade. The row is therefore built by matching `channel-version` against
 * the installed SDK's major.minor, and a brand new channel stays invisible
 * here on purpose.
 *
 * Inside a channel the comparison does cross feature bands (8.0.404 → 8.0.423).
 * That is looser than `dotnet sdk check`, which reports per band, but it is
 * exactly what a packaged upgrade of `Microsoft.DotNet.SDK.8` installs — so the
 * row describes what the update will actually do.
 *
 * With several SDKs side by side the highest one wins. The lower ones are
 * leftovers kept around for `global.json`-pinned builds; no package manager
 * offers to upgrade an old band in place anyway.
 *
 * Two things this provider deliberately does NOT do:
 *  - **no install-source note.** The SDK lands in a system prefix that carries
 *    no ownership signal (`C:\Program Files\dotnet`, `/usr/local/share/dotnet`),
 *    so path-based detection labels a winget install "manuel". Saying nothing
 *    beats saying something false.
 *  - **never `manual: true`.** For the same reason, marking the row manual
 *    would hide a real pending upgrade on most machines. The row stays visible
 *    and update() degrades to a SKIP carrying the download link.
 *
 * `requiresAdmin` stays unset too: each delegated command raises its own
 * elevation (UAC for winget/choco, `sudo` for apt/dnf), so routing this through
 * the elevation batch would only add a second prompt.
 */
export class DotnetSdkProvider implements Provider {
  readonly id = "dotnet-sdk";
  readonly displayName = ".NET SDK";
  readonly installHint = pickInstallHint({
    win32: `winget install Microsoft.DotNet.SDK.<majeur> — canaux disponibles : ${DOWNLOAD_PAGE}`,
    darwin: "brew install --cask dotnet-sdk",
    linux: `sudo apt-get install -y dotnet-sdk-<canal> — ou ${DOWNLOAD_PAGE}`,
    fallback: DOWNLOAD_PAGE,
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("dotnet");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const current = pickHighestSdk(await listInstalledSdks());
    const channel = current === null ? null : sdkChannel(current);
    if (current === null || channel === null) return [];

    const entry = await fetchChannel(channel);
    if (entry === null) return [];

    const latest = channelLatestSdk(entry);
    if (latest === null || !isUpgrade(current, latest)) return [];

    const note = describeChannel(entry);
    return [
      {
        id: channel,
        name: `.NET SDK ${channel}`,
        current,
        latest,
        ...(note !== "" && { note }),
      },
    ];
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const channel = normalizeChannel(packageId);
    if (channel === null) {
      return {
        id: packageId,
        success: false,
        message: `Canal .NET non reconnu : ${packageId}`,
      };
    }
    // Both the id lookup (one HTTPS GET) and the delegation (two spawns) can
    // reject on a broken PATH or a hostile environment; a throw here would
    // abort the whole update batch, so the failure degrades to the same SKIP
    // the manual path returns.
    try {
      return await delegateUpdate({
        id: channel,
        binary: "dotnet",
        packageIds: await dotnetPackageIds(channel),
        manualMessage: manualMessage(channel),
      });
    } catch {
      return {
        id: channel,
        success: false,
        skipped: true,
        message: manualMessage(channel),
      };
    }
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

function manualMessage(channel: string): string {
  return (
    `Installateur système : récupérer le SDK ${channel} sur ${DOWNLOAD_PAGE}` +
    " (Homebrew Cask : brew upgrade --cask dotnet-sdk)"
  );
}

/**
 * Installed SDK versions, or an empty list when the CLI is gone or broken.
 * `isAvailable()` only proved `dotnet` resolved on PATH when the scan started,
 * and a rejected spawn here would fail the provider instead of reporting
 * nothing.
 */
async function listInstalledSdks(): Promise<string[]> {
  try {
    const { stdout, failed } = await run("dotnet", ["--list-sdks"]);
    return failed ? [] : parseDotnetSdks(stdout);
  } catch {
    return [];
  }
}

/**
 * `dotnet --list-sdks` prints one SDK per line, version then install root:
 *
 *   8.0.404 [C:\Program Files\dotnet\sdk]
 *   10.0.100 [/usr/local/share/dotnet/sdk]
 *
 * Only the version is kept — the root differs per OS and per install method and
 * says nothing about how the SDK gets upgraded. Anchoring on the bracket is what
 * keeps host warnings and `DOTNET_*` banners out of the result, without matching
 * on their (localisable) wording.
 */
export function parseDotnetSdks(stdout: string): string[] {
  const out: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const version = rawLine.trim().match(/^(\d[^\s[]*)\s+\[/)?.[1];
    if (version) out.push(version);
  }
  return out;
}

/** Highest of the side-by-side SDKs, or null when none were parsed. */
export function pickHighestSdk(versions: string[]): string | null {
  let best: string | null = null;
  for (const version of versions) {
    if (best === null || compareSdkVersions(version, best) > 0) best = version;
  }
  return best;
}

/** `major.minor` of an SDK version — the `channel-version` key of the index. */
export function sdkChannel(version: string): string | null {
  const match = version.match(/^(\d+)\.(\d+)\./);
  const major = match?.[1];
  const minor = match?.[2];
  if (major === undefined || minor === undefined) return null;
  return `${major}.${minor}`;
}

/**
 * True when `latest` should be offered over `current`.
 *
 * The prerelease guard is a policy, not a comparison: right after a channel
 * goes GA the index keeps publishing previews of the *next* band under that
 * same channel, and a stable install must not be pushed onto one. Someone
 * already running a preview keeps getting newer previews — and, because
 * {@link compareSdkVersions} ranks a release above every preview of itself,
 * also gets offered the GA build that supersedes their preview.
 */
export function isUpgrade(current: string, latest: string): boolean {
  if (isPrerelease(latest) && !isPrerelease(current)) return false;
  return compareSdkVersions(latest, current) > 0;
}

function isPrerelease(version: string): boolean {
  return version.includes("-");
}

/**
 * Order two SDK versions the way .NET numbers them: a `major.minor.band` release
 * core, optionally followed by a `-preview.N.build` tail.
 *
 * The core decides first. On an equal core the release outranks every preview
 * of that same core — the case a flat digit-by-digit reduction gets backwards,
 * since `10.0.100-preview.6.25358.103` reduces to *more* segments than
 * `10.0.100` and would otherwise sort above the very build it precedes. Two
 * previews of one core then compare on their tails, which is what makes
 * preview.6 win over preview.5.
 */
function compareSdkVersions(a: string, b: string): number {
  const core = compareNumericParts(releaseCore(a), releaseCore(b));
  if (core !== 0) return core;

  const left = prereleaseTail(a);
  const right = prereleaseTail(b);
  if (left === "" && right === "") return 0;
  if (left === "") return 1;
  if (right === "") return -1;
  return compareNumericParts(left, right);
}

function releaseCore(version: string): string {
  const dash = version.indexOf("-");
  return dash === -1 ? version : version.slice(0, dash);
}

function prereleaseTail(version: string): string {
  const dash = version.indexOf("-");
  return dash === -1 ? "" : version.slice(dash + 1);
}

/** Segment-by-segment numeric comparison; a missing segment counts as 0. */
function compareNumericParts(a: string, b: string): number {
  const left = numericParts(a);
  const right = numericParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function numericParts(version: string): number[] {
  return version
    .split(/[^0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
}

/** Accept a channel id back from the CLI (`gup update dotnet-sdk:8.0`). */
function normalizeChannel(packageId: string): string | null {
  const trimmed = packageId.trim();
  return /^\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

// Lookup tables as Maps, not object literals: the keys come straight out of a
// network document, and `LABELS["toString"]` on a plain object resolves up the
// prototype chain and would splice a function into the note.
const RELEASE_TYPE_LABELS = new Map<string, string>([
  ["lts", "LTS"],
  ["sts", "STS"],
]);

const SUPPORT_PHASE_LABELS = new Map<string, string>([
  ["preview", "préversion"],
  ["go-live", "go-live"],
  ["active", "support actif"],
  ["maintenance", "maintenance"],
  ["eol", "fin de support"],
]);

/**
 * Support status of the channel, which is the one piece of context that changes
 * what the user should do: a patch on an `eol` channel is the last one they will
 * ever get, and that only shows if we say so.
 */
function describeChannel(entry: ReleaseChannel): string {
  return [
    RELEASE_TYPE_LABELS.get(entry["release-type"] ?? ""),
    SUPPORT_PHASE_LABELS.get(entry["support-phase"] ?? ""),
  ]
    .filter((label): label is string => label !== undefined)
    .join(" · ");
}

/**
 * The channel's `latest-sdk`, rejected unless it looks like an SDK version.
 * The value is rendered as-is in the table, so a malformed document should
 * produce no row rather than a row reading "undefined".
 */
function channelLatestSdk(entry: ReleaseChannel): string | null {
  const raw = entry["latest-sdk"];
  if (typeof raw !== "string") return null;
  const version = raw.trim();
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

function isPreviewChannel(entry: ReleaseChannel | null): boolean {
  return entry?.["support-phase"] === "preview";
}

async function fetchChannel(channel: string): Promise<ReleaseChannel | null> {
  try {
    const res = await fetch(RELEASES_INDEX_URL, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as ReleasesIndex;
    const entries = data["releases-index"];
    if (!Array.isArray(entries)) return null;
    return entries.find((e) => e?.["channel-version"] === channel) ?? null;
  } catch {
    return null;
  }
}

/**
 * Channel-scoped package ids, so `gup update dotnet-sdk:8.0` upgrades 8.0 and
 * cannot drag the machine onto .NET 10.
 *
 * Every id here was checked against its registry rather than extrapolated, and
 * a channel a registry does not carry gets **no** id for that manager: a missing
 * id makes `runPmUpdate` return the French SKIP, whereas a plausible-looking
 * wrong one makes it run a command that cannot resolve.
 *
 * `scoop` is absent on purpose: the main bucket's `dotnet-sdk` manifest tracks
 * whichever channel is newest, so delegating there would perform the very
 * migration this provider refuses to propose. Scoop users fall through to the
 * manual message.
 *
 * The index is fetched once more here to learn whether the channel is a preview
 * — the preview channel is packaged under different names everywhere, and the
 * row's id (`8.0`) does not carry that fact. The call is the same guarded
 * 5s helper the scan uses, and a failure just falls back to the stable naming,
 * which is right for every channel that is not in preview.
 */
async function dotnetPackageIds(channel: string): Promise<PackageIds> {
  const preview = isPreviewChannel(await fetchChannel(channel));
  const choco = chocoSdkId(channel, preview);
  return {
    winget: wingetSdkId(channel, preview),
    ...(choco !== null && { choco }),
    brew: await installedBrewFormula(channel),
    // Linux naming is standardized across distributions as
    // {product}-{type}-{version}; `dotnet-sdk-3.1` … `dotnet-sdk-9.0` are all
    // present in the packages.microsoft.com feed. Preview SDKs are not shipped
    // there at all.
    ...(preview ? {} : { apt: `dotnet-sdk-${channel}`, dnf: `dotnet-sdk-${channel}` }),
  };
}

/**
 * winget publishes one manifest per channel under `Microsoft.DotNet.SDK.<n>`:
 * the bare major for every `x.0` channel, the underscored channel for the one
 * channel with a non-zero minor, and the literal `Preview` for whatever is in
 * preview. microsoft/winget-pkgs currently holds exactly `3_1`, `5`, `6`, `7`,
 * `8`, `9`, `10` and `Preview` — note there is no `11` while 11.0 is a preview,
 * which is why the preview case is not just `major`.
 */
function wingetSdkId(channel: string, preview: boolean): string {
  if (preview) return "Microsoft.DotNet.SDK.Preview";
  const [major = channel, minor = "0"] = channel.split(".");
  return `Microsoft.DotNet.SDK.${minor === "0" ? major : `${major}_${minor}`}`;
}

/**
 * chocolatey names the SDK `dotnet-<channel>-sdk`, verified present on the
 * community feed for 5.0 through 10.0. Older channels break the pattern — .NET
 * Core 3.1 ships as `dotnetcore-sdk` and nothing at all is published for 3.0 and
 * below — and no preview package exists, so those cases return null instead of
 * an id that would only produce "package not found".
 */
function chocoSdkId(channel: string, preview: boolean): string | null {
  if (preview) return null;
  if (channel === "3.1") return "dotnetcore-sdk";
  const major = Number.parseInt(channel, 10);
  return Number.isFinite(major) && major >= 5 ? `dotnet-${channel}-sdk` : null;
}

/**
 * `dotnet@<major>` when that keg is installed, `dotnet` otherwise.
 *
 * Homebrew is the one manager without a per-channel package for the *current*
 * channel: `dotnet@8` and `dotnet@9` exist, `dotnet@10` does not, because the
 * unversioned `dotnet` formula is the current one. So the formula is chosen by
 * asking the local install what it actually has rather than by guessing which
 * versioned formula upstream happens to ship. `brew list --versions <formula>`
 * prints a line only for an installed formula and exits non-zero otherwise.
 *
 * `brewCask` is deliberately not set even though `dotnet-sdk` is a cask token
 * (there is no formula by that name): the cask token would take precedence over
 * `brew` for Linuxbrew too, where casks do not exist — and a cask install is
 * unreachable from this path anyway, since its shim resolves to
 * `/usr/local/share/dotnet/dotnet`, which `isHomebrewPath()` classifies as
 * manual. Cask users get the SKIP, which names `brew upgrade --cask dotnet-sdk`.
 */
async function installedBrewFormula(channel: string): Promise<string> {
  // No Homebrew prefix matches on Windows (`isHomebrewPath` is POSIX-anchored),
  // so the brew branch is unreachable there and the probe is pure cost.
  if (process.platform === "win32") return "dotnet";
  const versioned = `dotnet@${channel.split(".")[0] ?? channel}`;
  try {
    const { stdout, failed } = await run("brew", ["list", "--versions", versioned]);
    return !failed && stdout.trim() !== "" ? versioned : "dotnet";
  } catch {
    return "dotnet";
  }
}
