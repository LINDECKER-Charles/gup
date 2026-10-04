import { localized } from "../../i18n/localized.js";

/**
 * Why an artifact cannot be built, in the interface's languages: the
 * builders' last line of defence, behind `resolveTaskCommand`'s refusals.
 * The artifacts themselves hold no localized text — what the OS stores must
 * not depend on the language of the gup that wrote it, or every change of
 * language would rewrite the trigger.
 */
export const ARTIFACT_ERRORS = localized({
  en: {
    /** A path the OS would re-interpret in the trigger's command line. */
    unsafePath: (path: string) => `unschedulable path: ${path}`,
    invalidSid: (sid: string) => `invalid user SID: ${sid}`,
    /** gup's crontab block lost one of its markers (a hand edit): never guessed at. */
    brokenBlock: 'incomplete "gup-scheduler" block in the crontab: fix it by hand (crontab -e)',
  },
  fr: {
    unsafePath: (path) => `chemin non planifiable : ${path}`,
    invalidSid: (sid) => `SID utilisateur invalide : ${sid}`,
    brokenBlock:
      "bloc « gup-scheduler » incomplet dans la crontab : corrigez-la à la main (crontab -e)",
  },
});
