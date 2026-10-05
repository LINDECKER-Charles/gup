import { dirname } from "node:path";
import { localized } from "../../core/i18n/localized.js";
import { configDir, stateDir, type StateKind } from "../../core/state/app-dirs.js";
import {
  foreignEntriesIn,
  foreignEntryHint,
  type OwnershipContext,
} from "../../core/state/foreign-owner.js";
import { batchLockLocation } from "../../core/update/batch-lock.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli-module.js";

/**
 * gup refuses to start under sudo, as Homebrew does. macOS's sudo keeps the
 * user's HOME: run as root, gup wrote its history, log, settings and update
 * lock into that user's folders as root, and every later run as the user
 * failed on them — the update lock could not even be created. Its updates
 * went wrong too: Homebrew refuses root, and an npm or pip global installed
 * as root leaves root's files in the user's prefix.
 *
 * It need not run as root: the packages that need administrator rights run
 * in one `sudo gup __admin-batch` child, which this guard lets through — the
 * module does not opt in to the elevated child. Root itself (a root shell, a
 * container) is no sudo run: its home is its own.
 *
 * Its `gup doctor` line names what an earlier run under sudo left to root,
 * with the command that gives it back.
 */

const ROOT_UID = 0;
const STATE_KINDS: readonly StateKind[] = ["history", "logs", "reports", "scheduler"];

const ROOT_GUARD_LABELS = localized({
  en: {
    refused:
      "gup does not run under sudo: as root, it would leave files in your home folder that " +
      "your user can no longer write, and Homebrew refuses to run as root. Run gup without " +
      "sudo — it asks for your password itself when a package needs administrator rights.",
    diagnosticLabel: "File ownership",
    allYours: "gup's folders are yours",
  },
  fr: {
    refused:
      "gup ne se lance pas avec sudo : en root, il laisserait dans votre dossier personnel " +
      "des fichiers que votre utilisateur ne peut plus modifier, et Homebrew refuse de " +
      "tourner en root. Lancez gup sans sudo — il demande lui-même votre mot de passe quand " +
      "un paquet nécessite les droits administrateur.",
    diagnosticLabel: "Propriété des fichiers",
    allYours: "les dossiers de gup vous appartiennent",
  },
});

export interface RootGuardDeps {
  readonly env: NodeJS.ProcessEnv;
  /** This process's uid; undefined on Windows. */
  readonly uid: () => number | undefined;
  /** gup's folders, where a run under sudo left its files. */
  readonly gupDirs: () => readonly string[];
  /** How ownership is read; the running process's way by default. */
  readonly ownership: Partial<OwnershipContext>;
}

const DEFAULT_DEPS: RootGuardDeps = {
  env: process.env,
  uid: () => process.getuid?.(),
  gupDirs,
  ownership: {},
};

export function createRootGuardModule(deps: RootGuardDeps = DEFAULT_DEPS): CliModule {
  return {
    id: "root-guard",
    order: MODULE_ORDER.rootGuard,
    beforeAction() {
      if (isSudoRun(deps)) throw new Error(ROOT_GUARD_LABELS.refused);
    },
    diagnostics: async () => ownershipDiagnostics(deps),
  };
}

export const rootGuardModule = createRootGuardModule();

/** Root, reached through sudo from another account: `SUDO_UID` names that account. */
export function isSudoRun({ env, uid }: Pick<RootGuardDeps, "env" | "uid">): boolean {
  if (uid() !== ROOT_UID) return false;
  const invoker = Number(env["SUDO_UID"]);
  return Number.isInteger(invoker) && invoker !== ROOT_UID;
}

/**
 * One warning per entry another user owns, with the command that gives it
 * back; one line saying all is well otherwise. Nothing on Windows.
 */
function ownershipDiagnostics(deps: RootGuardDeps): DiagnosticLine[] {
  const uid = deps.uid();
  if (uid === undefined) return [];
  const ownership = { ...deps.ownership, uid };
  const label = ROOT_GUARD_LABELS.diagnosticLabel;
  const entries = foreignEntriesIn(deps.gupDirs(), ownership);
  if (entries.length === 0) return [{ label, value: ROOT_GUARD_LABELS.allYours, status: "ok" }];
  return entries.map((entry) => ({
    label,
    value: foreignEntryHint(entry, ownership),
    status: "warn",
  }));
}

/** The settings, every kind of state, and the update lock's own folder. */
function gupDirs(): string[] {
  const lock = batchLockLocation();
  const dirs = [
    configDir(),
    ...STATE_KINDS.map((kind) => stateDir(kind)),
    lock && dirname(lock.infoFile),
  ];
  return dirs.filter((dir): dir is string => typeof dir === "string");
}
