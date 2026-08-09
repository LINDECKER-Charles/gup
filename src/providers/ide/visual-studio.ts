import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { win32 as winPath } from "node:path";
import { pickInstallHint } from "../../core/install-hint.js";
import { isElevated, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Visual Studio — the Windows IDE, not VS Code (that one is `vscode-like`) and
 * not the VS extensions/marketplace.
 *
 * Scope is the *product* version of every installed instance: Community,
 * Professional, Enterprise, Build Tools, Test Agent — anything `vswhere`
 * reports, side-by-side instances included. Deliberately out of scope:
 *  - workloads and individual components inside an instance (the installer's
 *    `modify` verb, which needs a component id list we have no business
 *    guessing),
 *  - Preview/prerelease instances: they ride the Preview channel, and the only
 *    manifest we read is the Release one, so any row we produced for them would
 *    compare two different channels. `vswhere` excludes them by default (they
 *    need `-prerelease`), and `outdatedRow` drops them a second time.
 *
 * Installed side: `vswhere.exe`, which Microsoft guarantees at
 * `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe` since VS
 * 2017 15.2. Every flag used here (`-all`, `-products *`, `-format json`,
 * `-utf8`) comes from its documented usage text. Upstream side: the channel
 * manifest, whose `info.productDisplayVersion` is the display version of the
 * current Release build — see {@link channelUrl} for why the URL is not a
 * single template.
 *
 * Updating shells out to `setup.exe`, the entry point Microsoft documents for
 * the `update` verb in the very same directory (`vs_installer.exe` sits there
 * too but is documented nowhere, so it is not what we spawn). It needs admin —
 * rows carry `requiresAdmin` and the CLI batches them behind one UAC prompt.
 */
export class VisualStudioProvider implements Provider {
  readonly id = "visual-studio";
  readonly displayName = "Visual Studio";
  readonly installHint = pickInstallHint({
    win32: "winget install Microsoft.VisualStudio.2022.Community",
    fallback:
      "Windows uniquement — Visual Studio (l'IDE) n'existe pas sur cette plateforme.",
  });

  async isAvailable(): Promise<boolean> {
    return vswhereExe() !== null;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const instances = await listInstances();
    // One manifest per major, shared across instances: a machine with VS 2019
    // and VS 2022 side by side then costs two requests, not four.
    const channels = new Map<string, ChannelVersions | null>();
    const rows: OutdatedPackage[] = [];
    for (const instance of instances) {
      const row = await instanceRow(instance, channels);
      if (row) rows.push(row);
    }
    return rows;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const instances = await listInstances();
    const target = instances.find((i) => i.instanceId === packageId);
    return updateInstance(packageId, target?.installationPath);
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const instances = await listInstances();
    const outcomes: UpdateOutcome[] = [];
    // Sequential on purpose: a second installer process while one is running
    // bounces with exit 1001 ("Visual Studio installer process is running").
    for (const pkg of packages) {
      const target = instances.find((i) => i.instanceId === pkg.id);
      outcomes.push(await updateInstance(pkg.id, target?.installationPath));
    }
    return outcomes;
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Subset of a `vswhere -format json` entry that we actually read. */
export interface VsInstance {
  instanceId?: string;
  displayName?: string;
  installationVersion?: string;
  installationPath?: string;
  isPrerelease?: boolean;
  catalog?: { productDisplayVersion?: string };
}

interface ChannelManifest {
  info?: { productDisplayVersion?: string; buildVersion?: string };
  channelItems?: Array<{ id?: string; version?: string } | null>;
}

/**
 * The two version scales the manifest exposes. They are not interchangeable —
 * `display` is "17.14.37", `build` is "17.14.37516.0" — so a row must compare
 * like with like, hence keeping both rather than picking one up front.
 */
export interface ChannelVersions {
  display: string | null;
  build: string | null;
}

interface VersionPair {
  current: string;
  latest: string;
}

const PRODUCT_ITEM_PREFIX = "Microsoft.VisualStudio.Product.";

const NOT_ADMIN_MESSAGE =
  "L'installeur Visual Studio exige des droits administrateur. Relancer gup depuis un terminal « Exécuter en tant qu'administrateur ».";

const INSTALLER_MISSING_MESSAGE =
  "Installeur Visual Studio introuvable : mettre à jour depuis l'application Visual Studio Installer.";

const SPAWN_FAILED_MESSAGE =
  "Impossible de lancer l'installeur Visual Studio : mettre à jour depuis l'application Visual Studio Installer.";

// ---------------------------------------------------------------------------
// Locating the installer bits
// ---------------------------------------------------------------------------

/**
 * Candidate installer directories, most likely first. Microsoft pins the whole
 * installer directory under the x86 Program Files, including on 64-bit
 * installs; the non-x86 spellings are only there so a machine with an unusual
 * environment still gets probed instead of silently reporting nothing.
 *
 * `winPath.join` rather than `join`: these are Windows paths whatever host runs
 * the code, and the unit tests mock win32 from POSIX where `join` would emit
 * forward slashes.
 */
function installerDirs(): string[] {
  if (process.platform !== "win32") return [];
  const dirs: string[] = [];
  // Node's process.env is case-insensitive on Windows but not on the POSIX
  // hosts where the platform is mocked, so try both spellings.
  for (const name of [
    "ProgramFiles(x86)",
    "PROGRAMFILES(X86)",
    "ProgramFiles",
    "PROGRAMFILES",
  ]) {
    const base = process.env[name];
    if (!base) continue;
    const dir = winPath.join(base, "Microsoft Visual Studio", "Installer");
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

/** First existing `<installer dir>\<basename>`, or null. */
function installerFile(basename: string): string | null {
  for (const dir of installerDirs()) {
    const exe = winPath.join(dir, basename);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- %ProgramFiles% joined with hardcoded segments and a caller-side literal basename; no external input
    if (existsSync(exe)) return exe;
  }
  return null;
}

function vswhereExe(): string | null {
  return installerFile("vswhere.exe");
}

/**
 * `setup.exe` is the entry point Microsoft documents for the `update` verb:
 * "The Visual Studio installer […] is located in the folder
 * `C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe`".
 * `vs_installer.exe` lives beside it but appears in no documentation, so its
 * argument surface is unverifiable and we do not spawn it.
 */
function vsSetupExe(): string | null {
  return installerFile("setup.exe");
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

async function listInstances(): Promise<VsInstance[]> {
  const exe = vswhereExe();
  if (!exe) return [];
  try {
    const { stdout, failed } = await run(exe, [
      "-all",
      "-products",
      "*",
      "-format",
      "json",
      "-utf8",
    ]);
    if (failed) return [];
    return parseVswhereInstances(stdout);
  } catch {
    // run() rejects a command name carrying a character outside its allowlist,
    // and that is a throw, not a failed result. A scan has to survive it.
    return [];
  }
}

/**
 * `vswhere -format json` prints a JSON array of instance objects. Anything that
 * is not an array of objects carrying both an id and an install path is dropped
 * — a partially-written or locale-mangled payload must produce no row rather
 * than a row we cannot act on.
 */
export function parseVswhereInstances(stdout: string): VsInstance[] {
  try {
    const data: unknown = JSON.parse(stdout);
    if (!Array.isArray(data)) return [];
    const entries = data as Array<VsInstance | null>;
    return entries.filter(isUsableInstance);
  } catch {
    return [];
  }
}

function isUsableInstance(instance: VsInstance | null): instance is VsInstance {
  if (!instance || typeof instance !== "object") return false;
  return (
    typeof instance.instanceId === "string" &&
    instance.instanceId.length > 0 &&
    typeof instance.installationPath === "string" &&
    instance.installationPath.length > 0
  );
}

async function instanceRow(
  instance: VsInstance,
  channels: Map<string, ChannelVersions | null>,
): Promise<OutdatedPackage | null> {
  const major = majorOf(instance.installationVersion);
  if (!major) return null;
  const channel = await channelVersions(major, channels);
  if (!channel) return null;
  return outdatedRow(instance, channel);
}

/**
 * The whole decision — prerelease exclusion, which version scale to compare,
 * same-product-line check, and whether the channel is actually ahead — with no
 * I/O, so it can be driven straight from fixtures.
 */
export function outdatedRow(
  instance: VsInstance,
  channel: ChannelVersions,
): OutdatedPackage | null {
  const id = instance.instanceId;
  if (!id || instance.isPrerelease === true) return null;

  const pair = versionPair(instance, channel);
  if (!pair) return null;
  // Same product line on both sides. `update` never moves an instance across
  // majors, and the `stable` moniker (see channelUrl) will one day point at the
  // next major while VS 2026 instances are still installed — comparing those
  // would advertise an upgrade the installer cannot perform.
  const line = majorOf(pair.current);
  if (!line || line !== majorOf(pair.latest)) return null;
  // Strictly-newer, never "different": a lagging Release manifest, or an
  // instance ahead of it, must stay silent instead of announcing a downgrade.
  if (compareVersions(pair.latest, pair.current) <= 0) return null;

  return {
    id,
    name: instance.displayName ?? id,
    current: pair.current,
    latest: pair.latest,
    note: "via l'installeur Visual Studio",
    requiresAdmin: true,
  };
}

/**
 * Major version of the product line ("17" for VS 2022), taken from
 * `installationVersion`. Capped at three digits: the value is interpolated into
 * the manifest URL, and an anchored numeric match is what keeps it from being
 * anything but a path segment.
 */
function majorOf(version: string | undefined): string | null {
  return version?.match(/^(\d{1,3})\./)?.[1] ?? null;
}

async function channelVersions(
  major: string,
  cache: Map<string, ChannelVersions | null>,
): Promise<ChannelVersions | null> {
  const cached = cache.get(major);
  if (cached !== undefined) return cached;
  const fetched = await fetchChannelVersions(major);
  cache.set(major, fetched);
  return fetched;
}

/** Product line from which Microsoft stopped minting per-major channel links. */
const STABLE_MONIKER_MAJOR = 18;

/**
 * Channel manifest URL for a product line.
 *
 * `https://aka.ms/vs/<major>/release/channel` is right for 15, 16 and 17 (all
 * three answer with a `VisualStudio.<major>.Release` manifest). It is *not*
 * right from VS 2026 on: `/vs/18/release/channel` redirects to a search page
 * and answers HTML with a 200, while Microsoft's own installer documentation
 * moved to the `stable` moniker — and `https://aka.ms/vs/stable/channel` does
 * serve `VisualStudio.18.Release`. Newer majors keep riding `stable`; the
 * product-line guard in {@link outdatedRow} is what keeps a `stable` that has
 * moved on to the next major from comparing two different product lines.
 */
function channelUrl(major: string): string {
  const parsed = Number.parseInt(major, 10);
  return Number.isFinite(parsed) && parsed >= STABLE_MONIKER_MAJOR
    ? "https://aka.ms/vs/stable/channel"
    : `https://aka.ms/vs/${major}/release/channel`;
}

async function fetchChannelVersions(major: string): Promise<ChannelVersions | null> {
  try {
    const res = await fetch(channelUrl(major), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return parseChannelVersions(await res.json());
  } catch {
    // aka.ms answers a plain 200 with a search page for a moniker that does not
    // exist, so a JSON parse error here is the normal "no such channel".
    return null;
  }
}

/**
 * Channel manifest → the two comparable version scales.
 *
 * `info.productDisplayVersion` carries a release-name suffix in some manifests
 * ("17.14.37 (July 2026)") and none in others ("18.8.2"), which is why it goes
 * through the same leading-numeric extraction as the installed side.
 * `info.buildVersion` is the four-part scale `installationVersion` uses; the
 * `Microsoft.VisualStudio.Product.*` channel items carry the same value and
 * stand in when `info` is trimmed.
 */
export function parseChannelVersions(payload: unknown): ChannelVersions | null {
  if (typeof payload !== "object" || payload === null) return null;
  const manifest = payload as ChannelManifest;
  const display = numericPrefix(manifest.info?.productDisplayVersion);
  const build =
    numericPrefix(manifest.info?.buildVersion) ??
    productItemVersion(manifest.channelItems);
  if (!display && !build) return null;
  return { display, build };
}

/** Version of the first `Microsoft.VisualStudio.Product.*` channel item. */
function productItemVersion(items: ChannelManifest["channelItems"]): string | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (!item || typeof item.id !== "string" || typeof item.version !== "string") {
      continue;
    }
    if (!item.id.startsWith(PRODUCT_ITEM_PREFIX)) continue;
    const version = numericPrefix(item.version);
    if (version) return version;
  }
  return null;
}

/**
 * Prefer the display versions on both sides — that is what the About box and
 * the release notes show. Fall back to the four-part build versions when a
 * catalog entry is missing, never mixing the two scales.
 */
function versionPair(
  instance: VsInstance,
  channel: ChannelVersions,
): VersionPair | null {
  const display = numericPrefix(instance.catalog?.productDisplayVersion);
  if (display && channel.display) return { current: display, latest: channel.display };
  const build = numericPrefix(instance.installationVersion);
  if (build && channel.build) return { current: build, latest: channel.build };
  return null;
}

/**
 * Leading dotted-numeric run of a version string, so "17.14.37 (July 2026)"
 * and "17.14.37" collapse to the same comparable value. A flat character class
 * rather than `(?:\.\d+)*`: the input comes off the network, and a pattern with
 * no nested quantifier has nothing to backtrack over.
 */
function numericPrefix(raw: string | undefined): string | null {
  const head = raw?.trim().match(/^[0-9.]+/)?.[0]?.replace(/\.+$/, "");
  return head && /^[0-9]/.test(head) ? head : null;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

async function updateInstance(
  id: string,
  installationPath: string | undefined,
): Promise<UpdateOutcome> {
  if (!installationPath) {
    return {
      id,
      success: false,
      message: "Instance Visual Studio introuvable — relancer le scan.",
    };
  }
  const installer = vsSetupExe();
  if (!installer) {
    return { id, success: false, skipped: true, message: INSTALLER_MISSING_MESSAGE };
  }
  if (!(await elevated())) {
    return { id, success: false, skipped: true, message: NOT_ADMIN_MESSAGE };
  }
  const exitCode = await runUpdate(installer, installationPath);
  if (exitCode === null) {
    return { id, success: false, message: SPAWN_FAILED_MESSAGE };
  }
  return vsInstallerOutcome(id, exitCode);
}

/** `isElevated()` shells out; a refusal to spawn must read as "not elevated". */
async function elevated(): Promise<boolean> {
  try {
    return await isElevated();
  } catch {
    return false;
  }
}

/** Exit code of the installer, or null when it could not be spawned at all. */
async function runUpdate(
  installer: string,
  installationPath: string,
): Promise<number | null> {
  try {
    // Documented constraint: "You must initiate the installer programmatically
    // from a *different* directory that the installer resides in", so pin the
    // cwd to the temp directory instead of inheriting whatever gup was launched
    // from. `--installPath` is required for the update verb and `--norestart`
    // is only valid paired with `--passive` (or `--quiet`).
    const res = await runInherit(
      installer,
      ["update", "--passive", "--norestart", "--installPath", installationPath],
      { cwd: tmpdir() },
    );
    return res.exitCode;
  } catch {
    return null;
  }
}

const REBOOT_MESSAGE = "Mise à jour effectuée — redémarrer pour finaliser.";

const CANCELLED_MESSAGE = "Mise à jour annulée.";

/** Deferrals: nothing was installed, and retrying later is the right move. */
const SKIP_MESSAGES: ReadonlyMap<number, string> = new Map([
  [740, NOT_ADMIN_MESSAGE],
  [1602, CANCELLED_MESSAGE],
  [5004, CANCELLED_MESSAGE],
  [-1073741510, CANCELLED_MESSAGE],
]);

const FAILURE_MESSAGES: ReadonlyMap<number, string> = new Map([
  [1001, "L'installeur Visual Studio tourne déjà : le fermer puis relancer."],
  [1003, "Visual Studio est en cours d'utilisation : le fermer puis relancer."],
  [1618, "Une autre installation Windows est déjà en cours."],
  [5007, "Cette machine ne remplit pas les prérequis de la mise à jour."],
  [8006, "Des processus Visual Studio tournent encore : les fermer puis relancer."],
  [8010, "Système d'exploitation non pris en charge par cette mise à jour."],
  [-1073720687, "Échec de connexion réseau pendant la mise à jour."],
]);

/**
 * Microsoft's documented `%ERRORLEVEL%` table for the installer. 3010 and 1641
 * are successes that merely ask for a reboot — reporting them as failures would
 * send the user chasing an update that already applied. 740 (elevation
 * required) and the cancellation codes are deferrals rather than failures.
 */
export function vsInstallerOutcome(id: string, exitCode: number): UpdateOutcome {
  if (exitCode === 0) return { id, success: true };
  if (exitCode === 3010 || exitCode === 1641) {
    return { id, success: true, message: REBOOT_MESSAGE };
  }
  const skip = SKIP_MESSAGES.get(exitCode);
  if (skip) return { id, success: false, skipped: true, message: skip };
  const message = FAILURE_MESSAGES.get(exitCode);
  return { id, success: false, ...(message && { message }) };
}

/**
 * Numeric, component-by-component comparison. Returns >0 when `a` is newer.
 * Lexicographic comparison is unusable here: "17.14.7" > "17.14.37" as strings,
 * which would advertise a downgrade as an update.
 *
 * Local copy rather than an import from another provider — same call as
 * `jetbrains-plugins.ts`: providers stay independent of each other.
 */
function compareVersions(a: string, b: string): number {
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
