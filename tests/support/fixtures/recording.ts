import type { ProviderContractCase } from "../contract/types.js";
import type { CommandAnswer, SimPlatform } from "../system/types.js";
import { type FixtureRef, isFixtureRef } from "./refs.js";

/**
 * The pure half of the fixture recorder (scripts/fixtures/record.ts): which
 * command outputs the contract cases want recorded, which of them a run
 * selects, and what the per-provider manifest says about each file. Kept
 * here so the recorder stays a thin loop and these rules are self-tested.
 *
 * Only probes are ever recorded: a case's `update.installs` and routes are
 * never read, so the recorder runs nothing `gup list` would not run.
 */

/** One output to record: a probe a case scripts with a fixture reference. */
export interface RecordTarget {
  readonly domain: string;
  readonly providerId: string;
  readonly argv: readonly string[];
  readonly stdout?: FixtureRef;
  readonly stderr?: FixtureRef;
}

/** A case's domain and provider id, resolved by the caller (`create()` builds a provider). */
export interface LabelledCase {
  readonly domain: string;
  readonly providerId: string;
  readonly contractCase: ProviderContractCase;
}

function fixtureRefs(answer: CommandAnswer): Pick<RecordTarget, "stdout" | "stderr"> {
  return {
    ...(isFixtureRef(answer.stdout) && { stdout: answer.stdout }),
    ...(isFixtureRef(answer.stderr) && { stderr: answer.stderr }),
  };
}

function targetKey(target: RecordTarget): string {
  return [target.stdout?.path, target.stderr?.path].join("|");
}

/**
 * Every probe of a case simulated on `platform` whose output is a fixture
 * reference, once per fixture file however many cases share it.
 */
export function fixtureTargets(
  cases: readonly LabelledCase[],
  platform: SimPlatform,
): RecordTarget[] {
  const targets = new Map<string, RecordTarget>();
  for (const { domain, providerId, contractCase } of cases) {
    if (contractCase.system.platform !== platform) continue;
    for (const script of contractCase.system.commands ?? []) {
      const refs = fixtureRefs(script);
      if (!refs.stdout && !refs.stderr) continue;
      const target = { domain, providerId, argv: script.argv, ...refs };
      targets.set(targetKey(target), target);
    }
  }
  return [...targets.values()];
}

/** What a run of the recorder was asked for. */
export interface RecordRequest {
  readonly providers: readonly string[];
  readonly domains: readonly string[];
  readonly isAll: boolean;
  readonly isDryRun: boolean;
}

const USAGE =
  "usage: npm run fixtures:record -- (--all | --provider <id>… | --domain <domain>…) [--dry-run]";

/** Parse `--provider a b --domain os --dry-run`; a value list runs until the next flag. */
export function parseRecordArgs(args: readonly string[]): RecordRequest {
  const lists: Record<"--provider" | "--domain", string[]> = { "--provider": [], "--domain": [] };
  const flags = new Set<string>();
  let current: string[] | null = null;
  for (const arg of args) {
    if (arg === "--provider" || arg === "--domain") current = lists[arg];
    else if (arg === "--all" || arg === "--dry-run") flags.add(arg);
    else if (current && !arg.startsWith("--")) current.push(arg);
    else throw new Error(`unexpected argument ${JSON.stringify(arg)}\n${USAGE}`);
  }
  const request = {
    providers: lists["--provider"],
    domains: lists["--domain"],
    isAll: flags.has("--all"),
    isDryRun: flags.has("--dry-run"),
  };
  const isTargeted = request.providers.length > 0 || request.domains.length > 0;
  if (request.isAll === isTargeted) throw new Error(USAGE);
  return request;
}

/** The targets a request selects: everything, or the named providers and domains. */
export function selectTargets(
  targets: readonly RecordTarget[],
  request: RecordRequest,
): RecordTarget[] {
  if (request.isAll) return [...targets];
  return targets.filter(
    (target) =>
      request.providers.includes(target.providerId) || request.domains.includes(target.domain),
  );
}

/** One recorded file in `_manifest.json`. */
export interface ManifestEntry {
  readonly file: string;
  readonly argv: readonly string[];
  readonly platform: string;
  readonly os: string;
  readonly recordedAt: string;
  readonly gup: string;
  readonly redactions: Readonly<Record<string, number>>;
  /**
   * How a human made the file publishable (package names replaced, format
   * kept). Never written by the recorder: a re-recording drops it, so a raw
   * file is visible as such in review.
   */
  readonly neutralised?: string;
}

export interface FixtureManifest {
  readonly fixtures: readonly ManifestEntry[];
}

/** `manifest` with `entry` replacing the entry of the same file, sorted by file. */
export function withManifestEntry(
  manifest: FixtureManifest | null,
  entry: ManifestEntry,
): FixtureManifest {
  const others = (manifest?.fixtures ?? []).filter((known) => known.file !== entry.file);
  const fixtures = [...others, entry].sort((a, b) => a.file.localeCompare(b.file));
  return { fixtures };
}

/**
 * The text a fixture file holds: what gup received (the runner already
 * stripped one final newline), plus the newline the fake runner strips again.
 */
export function fixtureText(received: string): string {
  return `${received}\n`;
}
