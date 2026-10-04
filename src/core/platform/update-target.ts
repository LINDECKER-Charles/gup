import { hasControlCharacter } from "../scheduler/model/schedule-target.js";
import type { Provider } from "../types.js";
import { lookupProvider } from "./lookup-provider.js";

/**
 * A `provider:packageId` target checked for an update, the one rule every
 * path that turns text into an update applies: `gup update <cibles…>` and the
 * elevated `__admin-batch` child, which re-checks the targets its payload
 * file names before running them with administrator rights — a file in the
 * temp directory is not trusted because the parent wrote it.
 *
 * The provider is the text before the first `:` (package ids may hold more),
 * known and supported on this OS. The package id is not empty, never starts
 * with `-` (the provider's tool would read an option: `choco upgrade
 * --source=…`), and nothing holds a control character. Messages are French,
 * ready to print, and never echo a control character.
 */

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
    return invalid("package", "Cible refusée : caractère de contrôle interdit");
  }
  if (at <= 0) return invalid("format", `Format invalide: "${target}". Attendu provider:packageId`);
  const problem = packageIdProblem(packageId);
  if (problem !== null) return invalid("package", `Cible refusée : « ${target} » — ${problem}`);
  const lookup = lookupProvider(target.slice(0, at));
  if (!lookup.isFound) return invalid("provider", lookup.error);
  return { isValid: true, provider: lookup.provider, packageId };
}

function packageIdProblem(packageId: string): string | null {
  const start = packageId.trimStart();
  if (start === "") return "identifiant de paquet manquant";
  if (start.startsWith("-")) return "un identifiant de paquet ne commence pas par « - »";
  return null;
}
