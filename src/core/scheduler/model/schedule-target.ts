import { updateKeyOf } from "../../update/update-plan.js";
import type { ScheduleTarget } from "./types.js";

/**
 * A schedule target is one package of one provider, written
 * `provider:packageId`. Everything that would let a target stand for a whole
 * provider — no package id, a wildcard — is refused here, the first of the
 * three places that rule is enforced (the menu gesture and the run itself
 * are the others).
 *
 * The stored package id is only ever *matched* against what the provider's
 * own scan reports; the id passed to `update()` is the scan's. The checks
 * below are defence in depth: no option injection (`-…`), no control
 * characters, a sane length.
 */

export const MAX_PACKAGE_ID_LENGTH = 256;

/** The rule, as the CLI and the menu state it. */
export const NEVER_A_PROVIDER =
  "Une planification cible des paquets précis (provider:paquet), jamais un provider entier.";

const SEPARATOR = ":";
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const WILDCARD = /[*?]/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export type ParsedTarget =
  | { readonly ok: true; readonly target: ScheduleTarget }
  | { readonly ok: false; readonly reason: string };

/** `"winget:Git.Git"` → its target, or why it cannot be one (French). */
export function parseTarget(text: string): ParsedTarget {
  const trimmed = text.trim();
  const at = trimmed.indexOf(SEPARATOR);
  if (at === -1) return { ok: false, reason: NEVER_A_PROVIDER };
  const providerId = trimmed.slice(0, at);
  const packageId = trimmed.slice(at + 1).trim();
  if (!PROVIDER_ID.test(providerId)) {
    return { ok: false, reason: `« ${trimmed} » : identifiant de provider invalide` };
  }
  const problem = packageIdProblem(packageId);
  if (problem !== null) return { ok: false, reason: `« ${trimmed} » : ${problem}` };
  return { ok: true, target: { providerId, packageId } };
}

/** Why `packageId` cannot name a single package, or null when it can. */
export function packageIdProblem(packageId: string): string | null {
  if (packageId.trim() === "") {
    return "identifiant de paquet manquant — une planification ne vise jamais un provider entier";
  }
  if (WILDCARD.test(packageId)) {
    return "les jokers (* ?) sont refusés — une planification vise des paquets précis";
  }
  if (packageId.startsWith("-")) return "un identifiant de paquet ne commence pas par « - »";
  if (hasControlCharacter(packageId)) return "caractère de contrôle interdit";
  if (packageId.length > MAX_PACKAGE_ID_LENGTH) {
    return `identifiant trop long (${MAX_PACKAGE_ID_LENGTH} caractères au plus)`;
  }
  return null;
}

/** C0 controls and DEL: never legitimate in a name, an id or a path the OS will run. */
export function hasControlCharacter(text: string): boolean {
  return CONTROL_CHARACTER.test(text);
}

/** `provider:packageId` — the same identity the update pipeline gives a package. */
export function targetKey(target: Pick<ScheduleTarget, "providerId" | "packageId">): string {
  return updateKeyOf(target.providerId, target.packageId);
}
