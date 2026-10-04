/**
 * Every word of the HTML report (French, the language of the interface): the
 * static page and the client's texts. Plain data, embedded in the page as
 * JSON — the client fills `{name}` placeholders and picks `one`/`other` with
 * the French plural rules (0 and 1 take the singular). Tests import it.
 *
 * Lives beside the report rather than in `src/ui/text/`: these strings are
 * rendered by a browser, not a terminal, so the terminal glyph rules (and
 * their guard test) do not apply to them.
 */

const plural = (one: string, other: string) => ({ one, other }) as const;

export const REPORT_LABELS = {
  document: {
    title: "gup — Rapport d'activité ({period})",
    skipLink: "Aller au contenu",
    brand: "gup",
    heading: "Rapport d'activité",
    noscript:
      "Ce rapport a besoin de JavaScript pour s'afficher. Le fichier ne contient aucune " +
      "ressource externe.",
  },
  header: {
    period: "{label} · du {from} au {to}",
    navigation: "Sections du rapport",
    theme: "Thème",
    themes: { auto: "Auto", light: "Clair", dark: "Sombre" },
    print: "Imprimer",
  },
  search: {
    label: "Rechercher un paquet, un provider ou un message",
    /** Whole in the search box of a 320 px phone: the label says the rest. */
    placeholder: "Paquet, provider ou message…",
    shortcut: "/",
    active: "Recherche : « {query} »",
    clear: "Effacer la recherche",
  },
  nav: {
    overview: "Vue d'ensemble",
    calendar: "Calendrier",
    packages: "Paquets",
    failures: "Échecs",
    sessions: "Sessions",
  },
  pages: {
    overview: "Ce qui s'est passé sur la période, en un coup d'œil.",
    calendar:
      "Chaque case est un jour : plus elle est foncée, plus gup a mis de paquets à jour ce " +
      "jour-là.",
    packages: "Tous les paquets mis à jour ou tentés, et leur rythme de mise à jour.",
    failures: "Les mises à jour qui n'ont pas abouti, regroupées par paquet et par message.",
    sessions: "Chaque lancement de gup : ce qu'il a analysé et ce qu'il a mis à jour.",
  },
  banner: {
    truncated:
      "Rapport tronqué : seules les {kept} tentatives les plus récentes sont détaillées (les " +
      "chiffres couvrent toute la période). Réduisez la période (--since) pour tout voir.",
  },
  common: {
    none: "—",
    showMore: "Afficher {n} de plus ({rest} restants)",
  },
  units: {
    seconds: "{s} s",
    minutes: "{m} min {s} s",
    hours: "{h} h {m}",
    interval: "~{n} j",
    packages: plural("{n} paquet", "{n} paquets"),
    successes: plural("{n} réussie", "{n} réussies"),
    failures: plural("{n} échec", "{n} échecs"),
    skips: plural("{n} ignorée", "{n} ignorées"),
    scans: plural("{n} scan", "{n} scans"),
    attempts: plural("{n} tentative", "{n} tentatives"),
    sessions: plural("{n} session", "{n} sessions"),
    outdated: plural("{n} paquet en retard", "{n} paquets en retard"),
  },
  status: {
    success: { icon: "✔", label: "Réussie" },
    failed: { icon: "✖", label: "Échec" },
    skipped: { icon: "↷", label: "Ignorée" },
  },
  legend: { success: "Réussies", failed: "Échecs", skipped: "Ignorées" },
  triggers: {
    menu: "Menu",
    cli: "Ligne de commande",
    schedule: "Planifiée",
    unknown: "Origine inconnue",
  },
  cadences: {
    weekly: "hebdo.",
    monthly: "mensuel",
    quarterly: "trim.",
    rare: "rare",
    once: "une fois",
    none: "jamais réussie",
  },
  cadenceDescriptions: {
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    quarterly: "Trimestriel",
    rare: "Rare",
    once: "Une seule fois",
    none: "Jamais réussie",
  },
  charts: { showData: "Voir les données", hideData: "Masquer les données" },
  overview: {
    summary: "Résumé de la période",
    unit: plural("mise à jour réussie", "mises à jour réussies"),
    sentence: "{lead}, gup a mis à jour {packages} avec {rate} de réussite.",
    noSuccess: "{lead}, aucune mise à jour n'a abouti.",
    empty: "{lead}, gup n'a rien enregistré. Élargissez la période pour voir plus d'activité.",
    lastUpdate: "Dernière mise à jour réussie {when}.",
    lastScan: "Dernier scan {when}.",
    noActivity: "Aucune activité enregistrée.",
    activity: "Activité",
    activityIntro: "Mises à jour réussies par jour, sur toute la période.",
    /** A period longer than the calendar's 53 weeks: it shows the end of it. */
    activityIntroRecent: "Mises à jour réussies par jour, sur les 12 derniers mois de la période.",
    openCalendar: "Ouvrir le calendrier →",
    watch: "À surveiller",
    allFailures: "Tous les échecs →",
    top: "Les plus mis à jour",
    allPackages: "Tous les paquets →",
  },
  kpi: {
    title: "Chiffres clés",
    successRate: "Taux de réussite",
    packages: "Paquets mis à jour",
    failures: "Échecs",
    skips: "Ignorées",
    scans: "Scans",
    outdated: "En retard",
    hints: {
      successRate: "réussies / (réussies + échecs)",
      packages: "au moins une mise à jour réussie",
      failures: "tentatives qui ont échoué",
      skips: "passées par vous ou par le provider",
      scans: "analyses de la machine",
      outdated: "paquets à mettre à jour au dernier scan",
    },
  },
  rhythm: {
    weekly: "Mises à jour par semaine",
    monthly: "Mises à jour par mois",
    caption: "{attempts} sur {count} périodes, réussies, en échec et ignorées.",
    empty: "Aucune tentative de mise à jour sur cette période.",
    week: "Semaine du {day}",
    columns: ["Période", "Réussies", "Échecs", "Ignorées"],
  },
  outdated: {
    title: "Paquets en retard",
    summary: "max {max} · min {min} · actuel {current}",
    caption: "Paquets en retard au dernier scan complet de chaque jour : {summary}.",
    empty: "Pas encore de scan complet sur cette période.",
    emptyHint: "Un scan sans --fast ni filtre de providers alimente cette courbe.",
    columns: ["Jour", "Paquets en retard"],
  },
  providers: {
    title: "Providers",
    columns: [
      "Provider",
      "Réussies",
      "Échecs",
      "Ignorées",
      "Durée d'une mise à jour",
      "Durée du scan",
    ],
  },
  calendar: {
    intro: "Flèches pour parcourir les jours, Entrée pour voir les sessions du jour choisi.",
    gridLabel: "Activité de {year}",
    weekdays: ["lun", "", "mer", "", "ven", "", "dim"],
    fewer: "Moins",
    more: "Plus",
    nothing: "aucune activité",
    openDay: "Voir les sessions de ce jour",
  },
  packages: {
    caption: "Paquets de la période",
    none: "Aucun paquet mis à jour sur cette période.",
    noneHint: "Les paquets apparaissent ici dès leur première tentative de mise à jour.",
    noMatch: "Aucun paquet ne correspond aux filtres.",
    provider: "Provider",
    allProviders: "Tous les providers",
    cadence: "Rythme",
    allCadences: "Tous les rythmes",
    countOf: plural("{n} paquet sur {total}", "{n} paquets sur {total}"),
    columns: {
      name: "Paquet",
      provider: "Provider",
      successes: "Mises à jour",
      failures: "Échecs",
      lastVersion: "Dernière version",
      lastAt: "Dernière tentative",
      interval: "Intervalle médian",
      cadence: "Rythme",
    },
    sortIcons: { ascending: "↑", descending: "↓" },
  },
  drawer: {
    close: "Fermer",
    copy: "Copier l'identifiant",
    copied: "Identifiant copié",
    copyFailed: "Copie impossible",
    facts: {
      successes: "Réussies",
      failures: "Échecs",
      skips: "Ignorées",
      interval: "Intervalle médian",
      cadence: "Rythme",
      lastVersion: "Dernière version",
      firstAt: "Première tentative",
      lastAt: "Dernière tentative",
    },
    versions: "Versions installées",
    noVersion: "Aucune mise à jour réussie sur cette période.",
    allVersions: "Afficher les {n} versions",
    unknownVersions: "versions non précisées",
    attempts: "Tentatives ({n})",
  },
  attempt: {
    retry: "Nouvel essai : {label}",
    elevated: "Droits administrateur",
    scheduled: "Planifiée",
  },
  failures: {
    intro: "{failures} sur {packages}, du plus fréquent au plus rare.",
    none: "Aucun échec sur cette période.",
    noneHint: "Toutes les mises à jour tentées ont abouti ou ont été ignorées.",
    times: "{n} fois",
    last: "Dernier échec le {when}",
    noMessage: "(aucun message)",
    open: "Voir le paquet →",
  },
  sessions: {
    none: "Aucune session sur cette période.",
    noMatch: "Aucune session ne correspond aux filtres.",
    statuses: "Résultats affichés",
    provider: "Provider",
    day: "Jour : {day}",
    clearDay: "Effacer le filtre du jour",
    scanOnly: "Analyse seule, sans mise à jour.",
  },
  footer: {
    generated: "Généré localement par gup {version} le {date} ({zone}).",
    privacy:
      "Ce fichier ne fait aucune requête réseau et ne contient que des données de cette machine.",
    malformed: plural(
      "{n} ligne d'historique illisible a été ignorée.",
      "{n} lignes d'historique illisibles ont été ignorées.",
    ),
    unsupported: plural(
      "{n} ligne écrite par une version plus récente de gup a été ignorée.",
      "{n} lignes écrites par une version plus récente de gup ont été ignorées.",
    ),
    help: "Comment lire ce rapport",
    helpItems: [
      "Taux de réussite : réussies / (réussies + échecs). Une mise à jour ignorée n'est pas " +
        "un échec.",
      "Intervalle médian : le temps typique entre deux mises à jour réussies d'un paquet ; une " +
        "réussite moins d'une heure après la précédente compte pour la même mise à jour.",
      "Rythme : hebdomadaire jusqu'à 10 jours, mensuel jusqu'à 45, trimestriel jusqu'à 120, rare " +
        "au-delà.",
      "Paquets en retard : le dernier scan complet de chaque jour (sans --fast ni filtre).",
      "Les jours sont ceux du fuseau horaire de la machine qui a généré le rapport.",
    ],
  },
} as const;
