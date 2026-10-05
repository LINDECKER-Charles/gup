import { localized } from "../../core/i18n/localized.js";
import { MODULE_ORDER, type CliModule } from "./cli-module.js";

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
 */

const ROOT_UID = 0;

const ROOT_GUARD_LABELS = localized({
  en: {
    refused:
      "gup does not run under sudo: as root, it would leave files in your home folder that " +
      "your user can no longer write, and Homebrew refuses to run as root. Run gup without " +
      "sudo — it asks for your password itself when a package needs administrator rights.",
  },
  fr: {
    refused:
      "gup ne se lance pas avec sudo : en root, il laisserait dans votre dossier personnel " +
      "des fichiers que votre utilisateur ne peut plus modifier, et Homebrew refuse de " +
      "tourner en root. Lancez gup sans sudo — il demande lui-même votre mot de passe quand " +
      "un paquet nécessite les droits administrateur.",
  },
});

export interface RootGuardDeps {
  readonly env: NodeJS.ProcessEnv;
  /** This process's uid; undefined on Windows. */
  readonly uid: () => number | undefined;
}

const DEFAULT_DEPS: RootGuardDeps = {
  env: process.env,
  uid: () => process.getuid?.(),
};

export function createRootGuardModule(deps: RootGuardDeps = DEFAULT_DEPS): CliModule {
  return {
    id: "root-guard",
    order: MODULE_ORDER.rootGuard,
    beforeAction() {
      if (isSudoRun(deps)) throw new Error(ROOT_GUARD_LABELS.refused);
    },
  };
}

export const rootGuardModule = createRootGuardModule();

/** Root, reached through sudo from another account: `SUDO_UID` names that account. */
export function isSudoRun({ env, uid }: RootGuardDeps): boolean {
  if (uid() !== ROOT_UID) return false;
  const invoker = Number(env["SUDO_UID"]);
  return Number.isInteger(invoker) && invoker !== ROOT_UID;
}
