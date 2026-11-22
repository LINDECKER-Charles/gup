import { localized } from "../../../core/i18n/localized.js";

/**
 * The one question gup asks about sharing its journals: what goes out, why,
 * what never does, and how to change the answer. Asked once; the answer is
 * "no" unless the user says yes.
 */
export const CONSENT_LABELS = localized({
  en: {
    title: "Help improve gup?",
    what:
      "gup can send this machine's activity history and debug log to its maintainer, " +
      "so the problems you run into can be analysed. They are redacted the same way as " +
      "gup log export: secrets removed, your home folder shown as ~.",
    never: "Never sent: your settings file, your environment.",
    change: "Change it any time: gup feedback share on|off, or in Options.",
    question: "Share your journals?",
  },
  fr: {
    title: "Aider à améliorer gup ?",
    what:
      "gup peut envoyer l'historique d'activité et le journal de debug de cette machine à " +
      "son mainteneur, pour analyser les problèmes que vous rencontrez. Ils sont expurgés " +
      "comme pour gup log export : secrets retirés, dossier personnel affiché ~.",
    never: "Jamais envoyés : votre fichier de réglages, votre environnement.",
    change: "Modifiable à tout moment : gup feedback share on|off, ou dans Options.",
    question: "Partager vos journaux ?",
  },
});
