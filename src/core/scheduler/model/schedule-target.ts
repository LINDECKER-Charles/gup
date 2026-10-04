import { localized } from "../../i18n/localized.js";
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

/** Why a text cannot be a target, in the interface's languages. */
export const TARGET_MESSAGES = localized({
  en: {
    /** The rule, as the CLI and the menu state it. */
    neverAProvider:
      "A schedule targets specific packages (provider:package), never a whole provider.",
    invalidProvider: (text: string) => `"${text}": invalid provider id`,
    /** A package id's problem, after the text it was read from. */
    ofTarget: (text: string, problem: string) => `"${text}": ${problem}`,
    noPackageId: "missing package id — a schedule never targets a whole provider",
    wildcard: "wildcards (* ?) are refused — a schedule targets specific packages",
    leadingDash: 'a package id does not start with "-"',
    controlCharacter: "control character not allowed",
    tooLong: (max: number) => `id too long (${max} characters at most)`,
  },
  fr: {
    neverAProvider:
      "Une planification cible des paquets précis (provider:paquet), jamais un provider entier.",
    invalidProvider: (text) => `« ${text} » : identifiant de provider invalide`,
    ofTarget: (text, problem) => `« ${text} » : ${problem}`,
    noPackageId:
      "identifiant de paquet manquant — une planification ne vise jamais un provider entier",
    wildcard: "les jokers (* ?) sont refusés — une planification vise des paquets précis",
    leadingDash: "un identifiant de paquet ne commence pas par « - »",
    controlCharacter: "caractère de contrôle interdit",
    tooLong: (max) => `identifiant trop long (${max} caractères au plus)`,
  },
});

const SEPARATOR = ":";
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const WILDCARD = /[*?]/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export type ParsedTarget =
  | { readonly ok: true; readonly target: ScheduleTarget }
  | { readonly ok: false; readonly reason: string };

/** `"winget:Git.Git"` → its target, or why it cannot be one (in the active language). */
export function parseTarget(text: string): ParsedTarget {
  const trimmed = text.trim();
  const at = trimmed.indexOf(SEPARATOR);
  if (at === -1) return { ok: false, reason: TARGET_MESSAGES.neverAProvider };
  const providerId = trimmed.slice(0, at);
  const packageId = trimmed.slice(at + 1).trim();
  if (!PROVIDER_ID.test(providerId)) {
    return { ok: false, reason: TARGET_MESSAGES.invalidProvider(trimmed) };
  }
  const problem = packageIdProblem(packageId);
  if (problem !== null) return { ok: false, reason: TARGET_MESSAGES.ofTarget(trimmed, problem) };
  return { ok: true, target: { providerId, packageId } };
}

/** Why `packageId` cannot name a single package, or null when it can. */
export function packageIdProblem(packageId: string): string | null {
  if (packageId.trim() === "") return TARGET_MESSAGES.noPackageId;
  if (WILDCARD.test(packageId)) return TARGET_MESSAGES.wildcard;
  if (packageId.startsWith("-")) return TARGET_MESSAGES.leadingDash;
  if (hasControlCharacter(packageId)) return TARGET_MESSAGES.controlCharacter;
  if (packageId.length > MAX_PACKAGE_ID_LENGTH) {
    return TARGET_MESSAGES.tooLong(MAX_PACKAGE_ID_LENGTH);
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
