// Section content — kept out of components so adding/editing a step, a mode,
// or an install snippet does not require touching JSX.

export const content = {
  hero: {
    eyebrow: "CLI · TypeScript · Node ≥ 20",
    title: ["Une commande,", "~130 sources", "à jour."],
    lead:
      "orchestre les commandes natives de winget, npm, pip, helm, cargo et 125 autres gestionnaires de paquets — derrière une seule interface, en parallèle, sans état partagé.",
    stats: [
      { value: "~130", label: "providers" },
      { value: "4",    label: "méthodes par contrat" },
      { value: "<5s",  label: "scan en mode --fast" },
      { value: "0",    label: "daemon · 0 polling" },
    ],
  },

  problem: {
    sectionLabel: "§ 01 — Pourquoi",
    title: "10–15 commandes manuelles, plusieurs fois par mois. Aucune ne couvre tout.",
    lead:
      "Sur une station de dev moderne, un binaire peut venir de dizaines de sources concurrentes. Chacune a sa propre commande de listing, son format de sortie, ses edge-cases. Aucun outil natif ne les couvre toutes.",
    commands: [
      "winget upgrade",
      "scoop update *",
      "npm update -g",
      "pnpm self-update",
      "pip list --outdated",
      "pipx upgrade-all",
      "rustup update",
      "cargo install-update -a",
      "helm repo update",
      "kubectl version --client",
      "az upgrade",
      "gcloud components update",
      "code --list-extensions",
    ],
    overflowLabel: "+ 30 autres selon ta machine…",
    afterPoints: [
      { strong: "fail-soft",  text: "un provider qui pète n'affecte que sa cellule" },
      { strong: "pLimit(4)",  text: "concurrency bornée par défaut" },
      { strong: "opt-in",     text: "destructif uniquement à la demande" },
    ],
  },

  modes: {
    sectionLabel: "§ 02 — Trois modes d'usage",
    title: "Pensé pour le menu, l'automatisation et la chirurgie.",
    lead: "Le même moteur sert trois usages distincts. Clique un mode pour voir le terminal correspondant.",
    items: [
      { key: "menu",   ix: "Mode 01", title: "Menu interactif", desc: "gup → scan auto + REPL Review / Update / Options." },
      { key: "list",   ix: "Mode 02", title: "Non-interactif",  desc: "gup list --json, gup update --all -y. Pour CI et scripts." },
      { key: "target", ix: "Mode 03", title: "Ciblé",           desc: "gup update winget:… npm-g:… — bypass complet du scan." },
    ],
  },

  architecture: {
    sectionLabel: "§ 03 — Architecture",
    title: "Un orchestrateur, pas un gestionnaire.",
    lead:
      "gup n'invente pas de protocole d'update, n'embarque pas de cache de versions, ne télécharge rien. Il shell-out sur les commandes natives, fan-out en parallèle, et homogénéise les sorties derrière une seule interface.",
    cards: [
      { title: "Provider", desc: "Un module isolé pour une source d'installation. Implémente isAvailable, listOutdated, update, updateAll." },
      { title: "Registry", desc: "ALL_PROVIDERS[] statique. Fan-out par pLimit(4). Try/catch enveloppant : un crash devient un error de cellule." },
      { title: "Runner",   desc: "5 fonctions, point unique de shell-out. execa avec UTF-8, windowsHide, argv-vector, jamais de shell: true." },
      { title: "UI",       desc: "Spinner ora avec in-flight set, table cli-table3, prompts @inquirer groupés par provider." },
    ],
  },

  lifecycle: {
    sectionLabel: "§ 04 — Cycle de vie",
    lead: "Le cycle complet d'une commande, du parse argv jusqu'à l'exit code, en cinq étapes fail-soft.",
    steps: [
      { num: "01 · detect", title: "isAvailable()",      desc: "Probe parallèle, where/which en ms. Pas de scan tant que ce n'est pas vert." },
      { num: "02 · plan",   title: "filtres + flags",    desc: "--fast retire les slow, --provider restreint, --only ciblé." },
      { num: "03 · scan",   title: "listOutdated()",     desc: "pLimit(4) · try/catch global · pkg.manual filtré une fois pour toutes." },
      { num: "04 · select", title: "checkbox @inquirer", desc: "Group by provider, séparateurs, notes en gris. Confirme N → applique." },
      { num: "05 · update", title: "runInherit()",       desc: "stdout/stderr streamés en direct. retryable → menu de stratégies opt-in." },
    ],
  },

  providers: {
    sectionLabel: "§ 05 — Catalogue",
    title: "~130 providers, organisés par catégorie.",
    allLabel: "Tous",
    emptyLabel: "Aucun provider ne matche cette requête.",
    searchPlaceholder: "grep providers…",
  },

  install: {
    sectionLabel: "§ 06 — Installer",
    title: "Installe-le, vois ce qui traîne sur ta machine.",
    lead: "Node ≥ 20 requis. Cible principale Windows + WSL, fonctionne aussi sur macOS / Linux pour la sous-partie pertinente du registry.",
    cards: [
      {
        title: "npm",
        badge: "recommandé",
        desc: "Installation globale depuis le registry npm.",
        snippets: ["npm install -g @charles_lindecker/gup", "gup doctor"],
      },
      {
        title: "depuis les sources",
        badge: "contrib",
        desc: "Pour hacker un provider, ajouter une source, ou auditer le code.",
        snippets: [
          "git clone https://github.com/LINDECKER-Charles/gup",
          "cd gup && npm install && npm run build && npm link",
        ],
      },
    ],
    examples: [
      { cmd: "gup",                                 desc: "Menu interactif — scan + REPL" },
      { cmd: "gup list --fast --json",              desc: "Scan rapide, sortie machine-readable" },
      { cmd: "gup update --all -y",                 desc: "CI-safe : tout MAJ, sans prompt" },
      { cmd: "gup update winget:Git.Git",           desc: "Chirurgical — bypass complet du scan" },
      { cmd: "gup list --provider npm-g pip cargo", desc: "Restreindre à quelques sources" },
      { cmd: "gup doctor",                          desc: "Diagnostic — quoi est détecté, quoi manque" },
    ],
    support: {
      title: "Le projet t'est utile ?",
      lead:
        "gup est gratuit, MIT, et maintenu sur mon temps libre. Si l'outil t'a fait gagner du temps, tu peux me payer un café — ça aide à garder le rythme sur les ~130 providers.",
      cta: "Offrir un café sur Ko-fi",
      kofiUrl: "https://ko-fi.com/charleslindecker",
    },
  },

  footer: {
    tagline:
      "Global Updater — CLI orchestratrice pour ~130 sources d'installation. TypeScript strict, ESM, Node ≥ 20.",
    columns: [
      {
        title: "Projet",
        links: [
          { href: "https://github.com/LINDECKER-Charles/gup",                            label: "Code source · GitHub" },
          { href: "https://www.npmjs.com/package/@charles_lindecker/gup",                label: "Package · npm" },
          { href: "https://github.com/LINDECKER-Charles/gup/issues",                     label: "Issues" },
          { href: "https://github.com/LINDECKER-Charles/gup/blob/main/CONTRIBUTING.md",  label: "Contribuer" },
          { href: "https://ko-fi.com/charleslindecker",                                  label: "Soutenir · Ko-fi" },
        ],
      },
      {
        title: "Sécurité",
        links: [
          { label: "CodeQL · security-extended" },
          { label: "Semgrep · TS + Node" },
          { label: "gitleaks · audit-ci" },
          { label: "Vitest · security pins" },
        ],
      },
    ],
    bottom: {
      author: "Charles Lindecker · MIT",
      stack: "built with TypeScript strict, execa, commander, @inquirer/prompts",
    },
  },

  nav: {
    brandVersion: "v0.1.0",
    links: [
      { href: "#problem",      label: "Problème" },
      { href: "#modes",        label: "Usage" },
      { href: "#architecture", label: "Architecture" },
      { href: "#providers",    label: "Providers" },
      { href: "#install",      label: "Install" },
    ],
    kofiUrl: "https://ko-fi.com/charleslindecker",
    githubUrl: "https://github.com/LINDECKER-Charles/gup",
  },
};
