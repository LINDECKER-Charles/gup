import { localized } from "../i18n/localized.js";
import { hasControlCharacter } from "../scheduler/model/schedule-target.js";
import type { Provider } from "../types.js";
import { lookupProvider } from "./lookup-provider.js";

/**
 * A `provider:packageId` target checked for an update, the one rule every
 * path that turns text into an update applies: `gup update <targets…>` and the
 * elevated `__admin-batch` child, which re-checks the targets its payload
 * file names before running them with administrator rights — a file in the
 * temp directory is not trusted because the parent wrote it.
 *
 * The provider is the text before the first `:` (package ids may hold more),
 * known and supported on this OS. The package id is not empty, never starts
 * with `-` (the provider's tool would read an option: `choco upgrade
 * --source=…`), and nothing holds a control character. Messages are in the
 * interface's language, ready to print, and never echo a control character.
 */

/** The checks' messages; `gup update` starts its own format error with `invalidFormat`. */
export const UPDATE_TARGET_LABELS = localized({
  en: {
    controlCharacter: "Target refused: forbidden control character",
    invalidFormat: (target: string) =>
      `Invalid format: "${target}". Expected provider:packageId`,
    refused: (target: string, problem: string) => `Target refused: "${target}" — ${problem}`,
    missingPackageId: "missing package id",
    leadingDash: 'a package id never starts with "-"',
  },
  fr: {
    controlCharacter: "Cible refusée : caractère de contrôle interdit",
    invalidFormat: (target) => `Format invalide: "${target}". Attendu provider:packageId`,
    refused: (target, problem) => `Cible refusée : « ${target} » — ${problem}`,
    missingPackageId: "identifiant de paquet manquant",
    leadingDash: "un identifiant de paquet ne commence pas par « - »",
  },
});

export type UpdateTargetProblem = "format" | "package" | "provider";

export interface InvalidUpdateTarget {
  readonly isValid: false;
  readonly problem: UpdateTargetProblem;
  /** The text after the first `:`, or the whole target without one: the outcome's id. */
  readonly packageId: string;
  readonly error: string;
}

export type UpdateTargetResolution =
  | { readonly isValid: true; readonly provider: Provider; readonly packageId: string }
  | InvalidUpdateTarget;

const SEPARATOR = ":";

export function resolveUpdateTarget(target: string): UpdateTargetResolution {
  const at = target.indexOf(SEPARATOR);
  const packageId = at === -1 ? target : target.slice(at + 1);
  const invalid = (problem: UpdateTargetProblem, error: string): InvalidUpdateTarget => ({
    isValid: false,
    problem,
    packageId,
    error,
  });
  if (hasControlCharacter(target)) {
    return invalid("package", UPDATE_TARGET_LABELS.controlCharacter);
  }
  if (at <= 0) return invalid("format", UPDATE_TARGET_LABELS.invalidFormat(target));
  const problem = packageIdProblem(packageId);
  if (problem !== null) return invalid("package", UPDATE_TARGET_LABELS.refused(target, problem));
  const lookup = lookupProvider(target.slice(0, at));
  if (!lookup.isFound) return invalid("provider", lookup.error);
  return { isValid: true, provider: lookup.provider, packageId };
}

function packageIdProblem(packageId: string): string | null {
  const start = packageId.trimStart();
  if (start === "") return UPDATE_TARGET_LABELS.missingPackageId;
  if (start.startsWith("-")) return UPDATE_TARGET_LABELS.leadingDash;
  return null;
}
