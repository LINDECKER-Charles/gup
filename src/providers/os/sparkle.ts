import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { posix as posixPath } from "node:path";
import pLimit from "p-limit";
import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Sparkle — the de-facto self-update framework for macOS apps distributed
 * outside the App Store (https://sparkle-project.org). Every Sparkle-enabled
 * bundle carries an `SUFeedURL` key in its `Info.plist` pointing at an
 * "appcast" RSS feed. That one convention is enough to read an app's upstream
 * version with no CLI, no vendor API and no per-app special case.
 *
 * Why this provider exists: it fills the blind spot the other macOS providers
 * leave wide open.
 *   - `brew-cask` deliberately runs without `--greedy`, so every cask flagged
 *     `auto_updates true` — which is exactly the set of apps shipping a
 *     Sparkle updater — is hidden from it by design.
 *   - `mas` only covers the App Store, whose sandbox rules forbid Sparkle.
 * An app installed by dragging a .dmg into `/Applications` is invisible to
 * both. Here it is visible, and that visibility is the whole product.
 *
 * SCOPE DECISION — read before "fixing" the update path: rows are NOT marked
 * `manual: true`. `scanAll` filters manual rows out of the scan entirely, so
 * setting it would make this provider report nothing at all, i.e. delete its
 * only reason to exist. Instead `update()` returns a `skipped` outcome telling
 * the user to open the app and use its own "Check for Updates…". That is the
 * honest contract here: gup reports, Sparkle applies. Driving someone else's
 * in-app updater from a CLI would mean downloading and swapping a signed .app
 * bundle behind the user's back, short-circuiting the EdDSA signature check
 * that Sparkle exists to perform.
 *
 * Known limitations, all deliberate:
 *   - items gated behind a `<sparkle:channel>` (beta, nightly…) are skipped:
 *     nothing in the feed tells us which channels this user's updater is
 *     allowed to look in, and defaulting to "all" would report every user as
 *     late on a beta they never opted into.
 *   - `<sparkle:minimumSystemVersion>` is not evaluated, so an app whose newest
 *     item requires a macOS newer than the machine can still show up as
 *     outdated. Rare, and a false "there is a newer version" is cheap here
 *     since we never act on it.
 *   - feeds that bind the Sparkle namespace to a prefix other than `sparkle:`
 *     are not parsed. Legal XML, but no real-world feed does it.
 *   - only the three roots listed in {@link appDirectories} are walked, one
 *     level deep. Suites that nest their bundle (`/Applications/<Vendor>/x.app`)
 *     are missed; recursing would multiply the walk for a handful of apps.
 *   - non-https feeds are dropped outright (see {@link readFeedUrl}).
 *   - `plutil -extract … raw` needs macOS 12 or newer (plutil(1), HISTORY).
 *     On anything older every extraction fails and the provider reports
 *     nothing, which is the intended degradation for an EOL system.
 */
export class SparkleProvider implements Provider {
  readonly id = "sparkle";
  readonly displayName = "Sparkle (apps macOS)";
  readonly installHint = pickInstallHint({
    darwin:
      "Rien à installer : gup lit le flux Sparkle (SUFeedURL) des apps de /Applications.",
    fallback: "macOS uniquement — https://sparkle-project.org",
  });
  // Filesystem walk over every .app bundle plus one HTTP request per app that
  // declares a feed.
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      // `plutil` ships with every macOS install; probing it is really a probe
      // of "are we on a usable macOS", and it keeps the provider honest on a
      // stripped-down runner.
      return await commandExists("plutil");
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    if (process.platform !== "darwin") return [];
    try {
      return await scanBundles();
    } catch {
      // Belt and braces: every step below already degrades to null on its own,
      // and a provider that throws is reported as a failed scan.
      return [];
    }
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return {
      id: packageId,
      success: false,
      skipped: true,
      message:
        `Ouvrir ${packageId}, puis le menu de l'application → ` +
        "« Check for Updates… » : Sparkle télécharge et vérifie la signature lui-même.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return Promise.all(packages.map((pkg) => this.update(pkg.id)));
  }
}

// ---------------------------------------------------------------------------
// Bundle enumeration

/** Hard ceiling on inspected bundles — one HTTP request each, worst case. */
const MAX_BUNDLES = 200;
const HTTP_CONCURRENCY = 6;
const FEED_TIMEOUT_MS = 5_000;
/** Appcasts are a few kB; anything past this is a misrouted URL, not a feed. */
const MAX_FEED_CHARS = 512_000;
/** Feeds list every release ever shipped; the newest is never at the bottom. */
const MAX_ITEMS = 200;

const NOTE_SHORT = "Sparkle — updater intégré à l'app";
const NOTE_BUILD = "Sparkle — comparaison sur le build, updater intégré à l'app";

async function scanBundles(): Promise<OutdatedPackage[]> {
  const bundles = await listAppBundles();
  if (bundles.length === 0) return [];

  const limit = pLimit(HTTP_CONCURRENCY);
  const rows = await Promise.all(
    bundles.map((bundle) => limit(() => inspectBundleSafely(bundle))),
  );
  return rows.filter((row): row is OutdatedPackage => row !== null);
}

/**
 * `winPath` has no business here: these are macOS paths and `listOutdated`
 * already gated on `process.platform === "darwin"`, but unit tests mock the
 * platform from a Windows runner where bare `join` would emit backslashes.
 */
function appDirectories(): string[] {
  const dirs = ["/Applications", "/Applications/Utilities"];
  const home = safeHomedir();
  if (home) dirs.push(posixPath.join(home, "Applications"));
  return dirs;
}

/** `homedir()` throws when libuv cannot resolve the passwd entry. */
function safeHomedir(): string | null {
  try {
    const home = homedir();
    return home.length > 0 ? home : null;
  } catch {
    return null;
  }
}

/**
 * Bundle paths, deduped by bundle name: `~/Applications` routinely shadows
 * `/Applications` for the same app, and two rows sharing an id would make
 * `gup update sparkle:<id>` ambiguous. First directory listed wins.
 */
async function listAppBundles(): Promise<string[]> {
  const seen = new Set<string>();
  const bundles: string[] = [];
  for (const dir of appDirectories()) {
    for (const entry of await readAppEntries(dir)) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      bundles.push(posixPath.join(dir, entry));
    }
  }
  return bundles.slice(0, MAX_BUNDLES);
}

async function readAppEntries(dir: string): Promise<string[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed macOS roots plus homedir(); no external input reaches fs
    if (!existsSync(dir)) return [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same three roots as above
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(".app"));
  } catch {
    return [];
  }
}

function appNameOf(bundlePath: string): string {
  return posixPath.basename(bundlePath).replace(/\.app$/i, "");
}

// ---------------------------------------------------------------------------
// Per-bundle inspection

/**
 * One bundle must never take the scan down with it: a hostile feed, an
 * unreadable plist or a bundle name carrying a byte `run()` refuses are all
 * "this app has nothing to report", not "the provider failed".
 */
async function inspectBundleSafely(bundlePath: string): Promise<OutdatedPackage | null> {
  try {
    return await inspectBundle(bundlePath);
  } catch {
    return null;
  }
}

async function inspectBundle(bundlePath: string): Promise<OutdatedPackage | null> {
  const plistPath = posixPath.join(bundlePath, "Contents", "Info.plist");
  const feedUrl = await readFeedUrl(plistPath);
  // The cheap filter, and the reason the walk stays affordable: the vast
  // majority of bundles have no SUFeedURL and cost exactly one `plutil` here.
  if (!feedUrl) return null;

  const installed = await readInstalledVersions(plistPath);
  if (!installed) return null;

  const xml = await fetchAppcast(feedUrl);
  const feed = xml ? parseAppcastVersions(xml) : null;
  if (!feed) return null;

  const pair = pickComparablePair(installed, feed);
  if (!pair || compareVersions(pair.latest, pair.current) <= 0) return null;

  const name = appNameOf(bundlePath);
  return {
    id: name,
    name,
    current: pair.current,
    latest: pair.latest,
    note: pair.kind === "build" ? NOTE_BUILD : NOTE_SHORT,
  };
}

async function readFeedUrl(plistPath: string): Promise<string | null> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from a bundle name discovered by readdir on a fixed root
  if (!existsSync(plistPath)) return null;
  const raw = await plistValue(plistPath, "SUFeedURL");
  // A cleartext feed would let a network attacker dictate the "latest version"
  // we display. Drop it rather than surface an answer we cannot trust.
  return raw && isHttpsUrl(raw) ? raw : null;
}

/**
 * Info.plist is a *binary* plist in practically every shipped bundle, so it
 * cannot be read as XML. `plutil -extract <key> raw -o - <plist>` prints the
 * bare value and exits non-zero when the key is absent — which is precisely
 * the "does this app use Sparkle?" test. Both halves are documented in
 * plutil(1): `raw` "will print the unencapsulated value at the keypath", and
 * "the plutil command exits 0 on success, and 1 on failure".
 */
async function plistValue(plistPath: string, key: string): Promise<string | null> {
  try {
    const { stdout, failed } = await run("plutil", [
      "-extract",
      key,
      "raw",
      "-o",
      "-",
      plistPath,
    ]);
    if (failed) return null;
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    // `run` rejects (rather than resolving with `failed`) when an argv entry
    // trips its control-character allowlist. A bundle name is a filename, and
    // nothing stops a filename from carrying one.
    return null;
  }
}

async function readInstalledVersions(plistPath: string): Promise<AppVersions | null> {
  const short = await plistValue(plistPath, "CFBundleShortVersionString");
  const build = await plistValue(plistPath, "CFBundleVersion");
  return makeVersions(short, build);
}

function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchAppcast(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // A redirect chain can leave TLS behind, and only the final URL says who
    // actually answered. A cleartext hop makes the version untrustworthy for
    // the same reason a cleartext SUFeedURL does.
    if (res.url && !isHttpsUrl(res.url)) return null;
    // Cheap honest-server guard. A lying or chunked response still gets read,
    // hence the slice below; bytes vs chars is noise at this threshold.
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_FEED_CHARS) return null;
    const text = await res.text();
    return text.slice(0, MAX_FEED_CHARS);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Appcast parsing

/**
 * The two version flavours Sparkle carries, mirrored on both sides of the
 * comparison: `short` is `CFBundleShortVersionString` /
 * `sparkle:shortVersionString` (what users read), `build` is `CFBundleVersion`
 * / `sparkle:version` (the monotonic build number Sparkle actually orders on).
 */
export interface AppVersions {
  short?: string;
  build?: string;
}

const ITEM_OPEN = "<item";
const ITEM_CLOSE = "</item>";
const CHANNEL_RE = /<sparkle:channel\b/i;
// Recommended form since Sparkle 2: child elements of <item>.
const SHORT_ELEMENT_RE =
  /<sparkle:shortVersionString\b[^>]*>([\s\S]*?)<\/sparkle:shortVersionString>/i;
const VERSION_ELEMENT_RE = /<sparkle:version\b[^>]*>([\s\S]*?)<\/sparkle:version>/i;
// Legacy form, still deployed everywhere (iTerm2's live feed, for one):
// attributes on <enclosure>.
const SHORT_ATTR_RE = /\bsparkle:shortVersionString\s*=\s*"([^"]*)"/i;
const VERSION_ATTR_RE = /\bsparkle:version\s*=\s*"([^"]*)"/i;

/**
 * Newest advertised version in an appcast, or null when the feed carries none.
 *
 * Items are compared rather than trusted in document order: feeds are
 * conventionally newest-first but nothing enforces it, and generators that
 * append do exist. No XML parser on purpose — one dependency to keep a scan
 * honest is a bad trade, and the shapes involved are two fixed spellings.
 */
export function parseAppcastVersions(xml: string): AppVersions | null {
  let best: AppVersions | null = null;
  for (const item of extractItems(xml)) {
    // Channelled items target opted-in testers; see the class doc-comment.
    if (CHANNEL_RE.test(item)) continue;
    const found = itemVersions(item);
    if (found && (!best || isNewerThan(found, best))) best = found;
  }
  return best;
}

/**
 * Cut the feed into `<item>` blocks by hand rather than with a global
 * `<item\b[^>]*>[\s\S]*?<\/item>`: that pattern restarts a full-document scan
 * at every unclosed `<item` it meets, so a feed made of nothing but opening
 * tags costs quadratic time — a remote server we do not control would then
 * decide how long the scan hangs. indexOf is linear and cannot be made to spin.
 */
function extractItems(xml: string): string[] {
  const items: string[] = [];
  let cursor = 0;
  while (items.length < MAX_ITEMS) {
    const open = xml.indexOf(ITEM_OPEN, cursor);
    if (open === -1) break;
    const boundary = xml[open + ITEM_OPEN.length];
    // Only `<item>` and `<item …>`; never `<itemcount>` or a similar sibling.
    if (boundary !== ">" && boundary !== "/" && !isSpace(boundary)) {
      cursor = open + ITEM_OPEN.length;
      continue;
    }
    const close = xml.indexOf(ITEM_CLOSE, open);
    if (close === -1) break;
    items.push(xml.slice(open, close));
    cursor = close + ITEM_CLOSE.length;
  }
  return items;
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}

function itemVersions(item: string): AppVersions | null {
  const short = matchOne(item, SHORT_ELEMENT_RE) ?? matchOne(item, SHORT_ATTR_RE);
  const build = matchOne(item, VERSION_ELEMENT_RE) ?? matchOne(item, VERSION_ATTR_RE);
  return makeVersions(short, build);
}

/**
 * Ternaries rather than `...(x && {x})`: under `exactOptionalPropertyTypes` an
 * empty-string capture would otherwise spread a string into the object.
 */
function makeVersions(short: string | null, build: string | null): AppVersions | null {
  if (!short && !build) return null;
  return { ...(short ? { short } : {}), ...(build ? { build } : {}) };
}

function matchOne(text: string, re: RegExp): string | null {
  const raw = re.exec(text)?.[1];
  if (raw === undefined) return null;
  const value = raw.replace("<![CDATA[", "").replace("]]>", "").trim();
  // A leftover "<" means we captured markup, not a version.
  return value.length > 0 && !value.includes("<") ? value : null;
}

function isNewerThan(candidate: AppVersions, reference: AppVersions): boolean {
  if (candidate.short && reference.short) {
    return compareVersions(candidate.short, reference.short) > 0;
  }
  if (candidate.build && reference.build) {
    return compareVersions(candidate.build, reference.build) > 0;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Comparison

interface VersionPair {
  current: string;
  latest: string;
  kind: "short" | "build";
}

/**
 * Compare like with like or not at all. A bundle can sit at short `0.64.20` /
 * build `100` while its feed advertises short `0.64.22` / build `102`; pitting
 * `0.64.20` against `102` would report every such app as years behind. When
 * only one flavour is present on both sides, that is the one we use.
 */
function pickComparablePair(
  installed: AppVersions,
  feed: AppVersions,
): VersionPair | null {
  if (installed.short && feed.short) {
    return { current: installed.short, latest: feed.short, kind: "short" };
  }
  if (installed.build && feed.build && comparableShapes(installed.build, feed.build)) {
    return { current: installed.build, latest: feed.build, kind: "build" };
  }
  return null;
}

/**
 * Sanity gate on the build comparison only. `sparkle:version` is free-form and
 * legacy feeds routinely put a marketing version in it (iTerm2 ships
 * `sparkle:version="3.6.11"`) while the bundle keeps a bare counter in
 * `CFBundleVersion`. A single component against three or more can never be a
 * genuine before/after pair, and comparing them announces an imaginary
 * multi-major jump; every other shape goes through untouched.
 */
function comparableShapes(a: string, b: string): boolean {
  const left = numericParts(a).length;
  const right = numericParts(b).length;
  return !(left === 1 && right >= 3) && !(right === 1 && left >= 3);
}

/**
 * Numeric, component-by-component comparison. Returns >0 when `a` is newer.
 *
 * String inequality is not usable here: `"1.10" !== "1.9"` is true but says
 * nothing about order, and `"1.9" > "1.10"` lexicographically — which would
 * announce a downgrade as an update.
 */
export function compareVersions(a: string, b: string): number {
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

/**
 * Digit runs of the release core, in order. The semver pre-release / build
 * separators are cut first so `2.0-beta1` reduces to `[2, 0]` and not to
 * `[2, 0, 1]` — otherwise a beta would sort *above* the release it precedes
 * and gup would advertise `2.0 → 2.0-beta1` as an upgrade. Everything else is
 * a separator, so `v2.1`, `2.1` and `2_1` all reduce to `[2, 1]`; a suffix-only
 * pre-release therefore compares equal to its release, which errs towards
 * silence rather than towards a bogus row.
 */
function numericParts(version: string): number[] {
  const core = version.split(/[-+]/)[0] ?? version;
  return core
    .split(/[^0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
}
