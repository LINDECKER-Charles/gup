import { localized } from "../../../core/i18n/localized.js";

/**
 * `gup schedule`'s help, in the interface's languages: what each command
 * and option does, and the placeholders of the values they take. Command
 * names, flags and the values typed after them (`daily`, `headless`) are the
 * same in every language.
 */
export const SCHEDULE_COMMAND_LABELS = localized({
  en: {
    schedule: "Updates specific packages automatically, at a set time.",
    list: "Lists the schedules, their next and last run.",
    status: "State of the OS trigger (task, launchd agent or crontab).",
    json: "JSON output",
    add: "Schedules packages (provider:package), never a whole provider.",
    every: "daily, weekly or monthly",
    on: "weekly: mon…sun · monthly: 1 to 28 or last",
    at: "Time (default 09:00)",
    cron: '5-field cron expression, e.g. "0 9 * * 1-5"',
    name: "Name of the schedule",
    noCatchUp: "Do not catch up on a missed run",
    disabled: "Create the schedule disabled",
    remove: "Removes schedules.",
    enable: "Enables schedules.",
    disable: "Disables schedules.",
    runNow: "Runs a schedule now, in this terminal.",
    install: "Installs or repairs the OS trigger.",
    launcher: "Windows: headless (default) or direct",
    uninstall: "Removes the OS trigger and disables the schedules.",
    purge: "Also deletes the schedules and their state",
    /** Between `<…>` in the usage lines. */
    placeholders: {
      targets: "targets",
      frequency: "frequency",
      day: "day",
      name: "name",
      launcher: "launcher",
    },
  },
  fr: {
    schedule: "Met à jour automatiquement des paquets précis, à heure fixe.",
    list: "Liste les planifications, leur prochaine et leur dernière exécution.",
    status: "État du déclencheur système (tâche, agent launchd ou crontab).",
    json: "Sortie JSON",
    add: "Planifie des paquets (provider:paquet), jamais un provider entier.",
    every: "daily, weekly ou monthly",
    on: "weekly : lun…dim · monthly : 1 à 28 ou dernier",
    at: "Heure (défaut 09:00)",
    cron: 'Expression cron à 5 champs, ex. "0 9 * * 1-5"',
    name: "Nom de la planification",
    noCatchUp: "Ne pas rattraper une exécution manquée",
    disabled: "Créer la planification désactivée",
    remove: "Supprime des planifications.",
    enable: "Active des planifications.",
    disable: "Désactive des planifications.",
    runNow: "Exécute une planification maintenant, dans ce terminal.",
    install: "Installe ou répare le déclencheur système.",
    launcher: "Windows : headless (défaut) ou direct",
    uninstall: "Retire le déclencheur système et désactive les planifications.",
    purge: "Supprime aussi les planifications et leur état",
    placeholders: {
      targets: "cibles",
      frequency: "fréquence",
      day: "jour",
      name: "nom",
      launcher: "lanceur",
    },
  },
});
