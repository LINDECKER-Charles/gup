/** How the attempts of one rule end, occurrence after occurrence. */
export type AttemptPattern =
  /** Every attempt succeeds. */
  | "success"
  /** Every third attempt is skipped by the provider (a Microsoft Store install). */
  | "store-skip"
  /** Fails (hash mismatch), then succeeds the next active day with `--force`. */
  | "fail-then-force"
  /** Succeeds through the elevated batch (no duration: lost in the round trip). */
  | "elevated";

/** One package the fixture user updates by hand, regularly. */
export interface UpdateRule {
  readonly providerId: string;
  readonly packageId: string;
  /** First occurrence, in days from the start of the year of history. */
  readonly offsetDays: number;
  readonly everyDays: number;
  readonly pattern: AttemptPattern;
  /** The version installed today: earlier attempts walk back from it. */
  readonly installed: string;
  /** What an attempt after the last success aimed at (the scan's latest). */
  readonly next: string;
  /** Typical install time; each attempt varies around it. */
  readonly baseMs: number;
}

export const STORE_SKIP_MESSAGE = "installed from the Microsoft Store";
/** winget's own words for it, as an English Windows prints them. */
export const HASH_MISMATCH_MESSAGE = "Installer hash does not match";
export const FORCE_RETRY_LABEL = "retry --force";

type RuleRow = readonly [
  target: string,
  offsetDays: number,
  everyDays: number,
  pattern: AttemptPattern,
  installed: string,
  next: string,
  baseMs: number,
];

/**
 * The fixture user's habits over a year (oss-docs §4.3.4): what gets
 * updated, how often, and how it goes. Installed versions are those of the
 * scan fixture, so the Journal and Packages tell the same story.
 */
const RULES: readonly RuleRow[] = [
  ["npm-g:pnpm", 2, 7, "success", "10.17.0", "10.18.1", 4_200],
  ["npm-g:typescript", 5, 14, "success", "6.0.2", "6.0.3", 3_100],
  ["pipx:ruff", 1, 10, "success", "0.13.0", "0.13.2", 2_600],
  ["winget:Git.Git", 3, 21, "success", "2.51.0", "2.52.0", 18_400],
  ["winget:Spotify.Spotify", 4, 12, "store-skip", "1.2.71", "1.2.72", 9_200],
  ["winget:Microsoft.PowerToys", 8, 30, "fail-then-force", "0.94.1", "0.95.0", 61_000],
  ["choco:nodejs-lts", 15, 30, "elevated", "24.8.0", "24.9.0", 0],
  ["cargo:ripgrep", 20, 45, "success", "14.1.1", "15.0.0", 41_000],
  ["vscode-ext:esbenp.prettier-vscode", 0, 5, "success", "11.0.0", "11.0.1", 1_800],
];

function toRule(row: RuleRow): UpdateRule {
  const [target, offsetDays, everyDays, pattern, installed, next, baseMs] = row;
  const [providerId = "", packageId = ""] = target.split(/:(.*)/s);
  return { providerId, packageId, offsetDays, everyDays, pattern, installed, next, baseMs };
}

export const UPDATE_RULES: readonly UpdateRule[] = RULES.map(toRule);
