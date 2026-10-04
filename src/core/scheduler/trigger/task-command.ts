import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { localized } from "../../i18n/localized.js";
import { pathFlavour } from "../../platform/path-flavour.js";
import { hasControlCharacter } from "../model/schedule-target.js";
import type { InstallationProbe } from "./trigger-sync.js";

/**
 * The command the OS trigger runs: this gup, by absolute path, with its own
 * node. Resolved from the running process (realpath'd, so a symlinked
 * `gup` on PATH registers its real target) and refused when it could not
 * work unattended or would put the trigger at risk: a throw-away npx copy,
 * a source checkout run by tsx, a root shell, WSL, or a path the OS would
 * re-interpret (`%VAR%` expansion in Task Scheduler and cron, quotes).
 */

export const TICK_COMMAND = "__schedule-tick";

export interface TaskCommand {
  readonly node: string;
  readonly entry: string;
  readonly args: readonly [typeof TICK_COMMAND];
}

/** What the decision depends on — the running process by default, injected in tests. */
export interface InstallationFacts {
  readonly execPath: string;
  /** `process.argv[1]`. */
  readonly entry: string | undefined;
  readonly platform: NodeJS.Platform;
  /** POSIX uid; undefined on Windows. */
  readonly uid: number | undefined;
  readonly tempDir: string;
  readonly isWsl: boolean;
  /** Resolve symlinks; throws when the path does not exist. */
  realpath(path: string): string;
  /** The `name` of a package.json, or undefined when unreadable. */
  packageName(packageJson: string): string | undefined;
}

export const PACKAGE_NAME = "@charles_lindecker/gup";

const INSTALL_GLOBALLY = `npm i -g ${PACKAGE_NAME}`;

/** What installing gup globally is for, at the end of two refusals. */
const TO_SCHEDULE = { en: "to schedule updates", fr: "pour planifier des mises à jour" } as const;

/** Why this gup cannot be registered with the OS, in the interface's languages. */
export const COMMAND_REFUSALS = localized({
  en: {
    notGlobal: `gup must be installed globally — ${INSTALL_GLOBALLY} — ${TO_SCHEDULE.en}`,
    fromSources: `gup runs from its sources: ${INSTALL_GLOBALLY} ${TO_SCHEDULE.en}`,
    root: "do not use sudo with gup schedule: schedules belong to the user",
    wsl: "in WSL, schedule from gup on Windows — the wsl-* providers cover your distributions",
    noEntry: "gup entry point not found",
    unsafePath: (path: string): string =>
      `unschedulable path (quote, %, apostrophe or control character): ${path}`,
  },
  fr: {
    notGlobal: `gup doit être installé globalement — ${INSTALL_GLOBALLY} — ${TO_SCHEDULE.fr}`,
    fromSources: `gup tourne depuis ses sources : ${INSTALL_GLOBALLY} ${TO_SCHEDULE.fr}`,
    root: "n'utilisez pas sudo avec gup schedule : la planification est propre à l'utilisateur",
    wsl:
      "dans WSL, planifiez depuis gup sous Windows — les providers wsl-* couvrent " +
      "vos distributions",
    noEntry: "point d'entrée de gup introuvable",
    unsafePath: (path) =>
      `chemin non planifiable (guillemet, %, apostrophe ou caractère de contrôle) : ${path}`,
  },
});

const NPX_CACHE = /[\\/]_npx[\\/]/;
/** Task Scheduler expands %VAR% and splits on quotes; cron expands % and the shell sees quotes. */
const UNSAFE_BY_PLATFORM: Readonly<Partial<Record<NodeJS.Platform, RegExp>>> = {
  win32: /["%]/,
  linux: /['%]/,
};
const ROOT_UID = 0;

export function resolveTaskCommand(facts: InstallationFacts): TaskCommand | { error: string } {
  const refusal = environmentRefusal(facts);
  if (refusal) return { error: refusal };
  let node: string;
  let entry: string;
  try {
    node = facts.realpath(facts.execPath);
    entry = facts.realpath(facts.entry ?? "");
  } catch {
    return { error: COMMAND_REFUSALS.noEntry };
  }
  const problem = entryProblem(entry, facts);
  if (problem) return { error: problem };
  const unsafe = [node, entry].find((path) => isUnsafePath(path, facts.platform));
  if (unsafe !== undefined) return { error: COMMAND_REFUSALS.unsafePath(unsafe) };
  return { node, entry, args: [TICK_COMMAND] };
}

/** The package root of an entry point: `<root>/dist/cli.js` → `<root>`. */
export function packageRootOf(entry: string, platform: NodeJS.Platform): string {
  const { dirname } = pathFlavour(platform);
  return dirname(dirname(entry));
}

/** The running machine's answers to "does this path exist, which package owns this entry". */
export function installationProbe(platform: NodeJS.Platform): InstallationProbe {
  return {
    exists: (path) => existsSync(path),
    packageRoot: (entry) => packageRootOf(realpathOr(entry), platform),
  };
}

/** True when the OS would re-interpret `path` in the trigger's command line. */
export function isUnsafePath(path: string, platform: NodeJS.Platform): boolean {
  return hasControlCharacter(path) || (UNSAFE_BY_PLATFORM[platform]?.test(path) ?? false);
}

/** The facts of the running process. */
export function currentInstallationFacts(): InstallationFacts {
  return {
    execPath: process.execPath,
    entry: process.argv[1],
    platform: process.platform,
    uid: process.getuid?.(),
    tempDir: realpathOr(tmpdir()),
    isWsl: process.platform === "linux" && readsAsWsl(),
    realpath: (path) => realpathSync(path),
    packageName: (packageJson) => {
      try {
        const parsed = JSON.parse(readFileSync(packageJson, "utf8")) as { name?: unknown };
        return typeof parsed.name === "string" ? parsed.name : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

function environmentRefusal(facts: InstallationFacts): string | null {
  if (facts.isWsl) return COMMAND_REFUSALS.wsl;
  if (facts.platform !== "win32" && facts.uid === ROOT_UID) return COMMAND_REFUSALS.root;
  if (facts.entry === undefined) return COMMAND_REFUSALS.noEntry;
  return null;
}

function entryProblem(entry: string, facts: InstallationFacts): string | null {
  const path = pathFlavour(facts.platform);
  if (entry.endsWith(".ts")) return COMMAND_REFUSALS.fromSources;
  if (!entry.endsWith(".js")) return COMMAND_REFUSALS.noEntry;
  if (NPX_CACHE.test(entry) || isInside(entry, facts)) return COMMAND_REFUSALS.notGlobal;
  const packageJson = path.join(packageRootOf(entry, facts.platform), "package.json");
  if (facts.packageName(packageJson) !== PACKAGE_NAME) return COMMAND_REFUSALS.notGlobal;
  return null;
}

/** Under the temp dir: a copy that a cleanup (or the next reboot) deletes. */
function isInside(entry: string, facts: InstallationFacts): boolean {
  const path = pathFlavour(facts.platform);
  const relative = path.relative(facts.tempDir, entry);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Windows hands out 8.3 short temp paths; compare with the long form realpath gives. */
function realpathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const WSL_MARKER = /microsoft/i;

function readsAsWsl(): boolean {
  try {
    return WSL_MARKER.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}
