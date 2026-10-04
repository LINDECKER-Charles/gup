/**
 * French catalog, translated from en.js (the source) in the brand's existing
 * voice (tutoiement). French typography: a narrow no-break space (U+202F,
 * `NB` below) before `: ; ! ?` and inside « ». Format and rules: see en.js.
 */
const NB = String.fromCodePoint(0x202f);

export default {
  meta: {
    title: "gup — winget, brew, npm et pip à jour en une commande",
    description:
      "CLI open source et gratuite qui scanne et met à jour {providers} sources — winget, " +
      "scoop, Homebrew, npm, pip, cargo, helm — depuis une app de terminal.",
    ogTitle: "gup — une commande, {providers} sources à jour",
    ogDescription:
      "Un seul binaire scanne winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, " +
      "kubectl, VS Code et JetBrains — {providers} sources en parallèle — et met à jour ce " +
      "que tu choisis dans un terminal intégré à son interface.",
    ogImageAlt:
      "gup — une commande, {providers} sources à jour. CLI open source pour winget, " +
      "Homebrew, npm, pip, cargo et helm.",
    keywords:
      "mettre à jour tous les paquets, gestionnaire de paquets, winget upgrade, brew upgrade, " +
      "npm update -g, pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, " +
      "alternative à topgrade",
  },
  common: {
    skipLink: "Aller au contenu",
    home: "gup — accueil",
    github: "Code source sur GitHub",
    install: "Installer",
    copy: "Copier",
    copied: `Copié${NB}!`,
    copyLabel: `Copier la commande d'installation${NB}: {installCommand}`,
    copyStatus: "Commande copiée dans le presse-papiers",
    copyFailed: "Échec de la copie — sélectionne la commande et copie-la",
    language: "Langue",
    languageCurrent: `Langue${NB}: {endonym}`,
    newBadge: "Nouveau",
    noscript:
      `JavaScript est désactivé${NB}: la page reste entièrement lisible${NB}; seuls ` +
      `l'animation du terminal et les boutons «${NB}copier${NB}» sont inactifs.`,
  },
  nav: {
    label: "Sections de la page",
    features: "Fonctionnalités",
    coverage: "Couverture",
    how: "Fonctionnement",
    faq: "FAQ",
  },
  hero: {
    eyebrow: "Nouveau — les mises à jour se font dans l'interface",
    title: { before: "Une commande.", accent: "{providers} sources", after: "à jour." },
    lead:
      "Arrête de courir après **winget**, **brew** et **npm**, pip, cargo et helm. gup les " +
      "scanne tous en parallèle, te montre ce qui traîne et met à jour ce que tu choisis — " +
      "en direct, dans un terminal intégré à son interface.",
    secondaryCta: "Voir sur GitHub",
    trust: [
      "MIT · open source",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "0 télémétrie",
      "0 daemon · planification opt-in",
    ],
    terminal: {
      label: "gup en action",
      tabs: { app: "Interface", update: "Mise à jour", json: "JSON" },
      caption:
        "L'interface est en français. Commandes, options et sortie JSON sont identiques dans " +
        "toutes les langues.",
    },
  },
  features: {
    kicker: "01 / FONCTIONNALITÉS",
    title: "Tout se passe dans une seule interface.",
    lead:
      "Scanner, choisir, mettre à jour, planifier, consulter — gup te garde dans une seule " +
      "app de terminal plein écran.",
    items: {
      inline: {
        title: "Des mises à jour sans quitter gup",
        text:
          "Les installeurs tournent dans un terminal intégré à l'interface — barres de " +
          "progression, invites et couleurs intactes. Les paquets mis à jour quittent " +
          "ensuite la liste, sans nouveau scan. Si le terminal intégré est indisponible, " +
          "gup te dit pourquoi et met à jour dans ton propre terminal.",
      },
      select: {
        title: "Coche-en plusieurs, lance une fois",
        text:
          "Coche les paquets avec [[Espace]], sélectionne tout avec [[a]], lance avec " +
          "[[Entrée]]. Une file, un bilan.",
      },
      schedule: {
        title: "Mises à jour planifiées, paquet par paquet",
        text:
          `Coche des paquets et appuie sur [[p]]${NB}: ` +
          "`ripgrep` passe en mise à jour hebdomadaire, `node` ne bouge pas. Les " +
          `planifications visent des paquets, jamais un provider entier${NB}; le ` +
          "planificateur de ton OS lance brièvement gup pour faire ce qui arrive à échéance, " +
          "et rien ne reste en mémoire.",
      },
      journal: {
        title: "Journal d'activité",
        text:
          "Chaque scan et chaque mise à jour sont journalisés en local. Des graphiques dans " +
          "le terminal montrent ton activité et les paquets les plus souvent mis à " +
          `jour${NB}; exporte le journal pour déboguer.`,
      },
      report: {
        title: "Rapport HTML",
        text:
          "`gup report`, ou [[o]] dans le journal, ouvre dans le navigateur un rapport clair " +
          "et navigable de ton historique — un seul fichier hors ligne, lisible par tout le " +
          "monde, pas seulement par les habitués du terminal.",
      },
      themes: {
        title: "Des thèmes qui restent lisibles",
        text:
          `Dix thèmes intégrés ou tes propres couleurs${NB}: gup vérifie chacun au regard ` +
          "du WCAG AA — 4,5:1 pour le texte, 3:1 pour les bordures, 7:1 si tu choisis AAA " +
          "— et corrige ce qui n'atteint pas le seuil.",
      },
      os: {
        title: "Attentif à ton OS",
        text:
          "Les providers qui ne peuvent pas tourner sur ton système sont grisés, pas " +
          `masqués${NB}: les outils réservés à Windows apparaissent comme tels sur un Mac, ` +
          "et inversement.",
      },
      script: {
        title: "Pensé pour les scripts et la CI",
        text:
          "`gup list --json`, des codes de sortie stables, `-y` pour sauter les " +
          "confirmations, et des cibles `provider:package` qui court-circuitent le scan.",
      },
    },
  },
  coverage: {
    kicker: "02 / COUVERTURE",
    title: "{providers} sources. Trois systèmes. Un seul binaire.",
    lead:
      "Le même exécutable sur Windows, macOS et Linux — même contrat de provider, même " +
      "JSON. Ce qui change, c'est la couche OS que gup sait piloter.",
    delegated: "délégation",
    supported: "Providers pris en charge",
    everywhere: "Partout pareil",
    allProviders: "Les {providers} providers, par domaine",
    catalogLink: "Parcourir le catalogue complet des providers",
    platforms: {
      windows: {
        badge: "Cible principale",
        foot:
          `Pont WSL${NB}: apt, dnf, pacman, Flatpak, Nix et Linuxbrew dans tes distributions.`,
      },
      macos: {
        badge: "Natif",
        foot:
          "Apple Silicon et Intel · liens symboliques du Cellar brew résolus · `mas` optionnel.",
      },
      linux: {
        badge: "Natif",
        foot:
          "Le propriétaire d'un binaire est résolu avec `dpkg -S` ou `rpm -qf`, puis la mise " +
          "à jour revient à ce gestionnaire.",
      },
    },
    domains: {
      os: "Gestionnaires de paquets de l'OS",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET et PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "Autres langages",
      toolchain: "Gestionnaires de versions",
      cloud: "CLI cloud",
      iac: "Infrastructure en tant que code",
      kubernetes: "Kubernetes",
      containers: "Conteneurs",
      security: "Outillage de sécurité",
      "dev-cli": "CLI de développement",
      ide: "IDE et éditeurs",
      "editor-plugins": "Plugins d'éditeurs",
      "embedded-mobile": "Embarqué et mobile",
      shell: "Shell et prompt",
      self: "gup lui-même",
    },
  },
  how: {
    kicker: "03 / FONCTIONNEMENT",
    title: "Un orchestrateur, pas un gestionnaire de plus.",
    lead:
      "gup lance les commandes de chaque outil en parallèle et aligne les réponses. Pas de " +
      "registre, pas de cache, rien qui reste en mémoire.",
    steps: {
      scan: {
        title: "Scanner",
        text:
          "Chaque provider détecté répond à `listOutdated()`, quatre à la fois. Celui qui " +
          "échoue n'affecte que sa propre ligne.",
      },
      choose: {
        title: "Choisir",
        text:
          "Passe en revue les paquets groupés par provider, filtre, sélectionne — ou saute " +
          "le scan avec `gup update brew:fzf`.",
      },
      update: {
        title: "Mettre à jour",
        text:
          "Les commandes natives tournent en vecteur d'arguments, jamais via un shell. " +
          "Chaque tentative est consignée dans le journal local.",
      },
    },
    docsLink: "L'architecture en détail",
  },
  security: {
    kicker: "04 / SÉCURITÉ",
    title: "Il lance des commandes privilégiées. Il est construit en conséquence.",
    lead:
      "Un point unique de shell-out, des vecteurs d'arguments stricts, une allowlist pinnée " +
      "par les tests — et chaque commit passe par trois analyseurs statiques.",
    items: {
      execution: {
        title: "Exécution",
        text:
          "Les sous-processus tournent en vecteurs argv stricts, jamais `shell: true`, via " +
          "un unique point d'entrée audité.",
      },
      supplyChain: {
        title: "Chaîne d'approvisionnement",
        text:
          "Téléchargements HTTPS uniquement, dépendances auditées à chaque build, mises à " +
          "jour revues chaque semaine.",
      },
      analysis: {
        title: "Analyse statique",
        text:
          "CodeQL, Semgrep et eslint-plugin-security sur chaque commit, plus une suite de " +
          "tests dédiée aux invariants de sécurité.",
      },
    },
    links: { policy: "Politique de sécurité", contributing: "Contribuer" },
  },
  faq: {
    kicker: "05 / FAQ",
    title: "Questions, réponses.",
    items: {
      replace: {
        q: `gup remplace-t-il winget, brew ou npm${NB}?`,
        a:
          "Non. gup orchestre les commandes natives de chaque outil (`winget upgrade`, " +
          "`brew outdated`, `npm update -g`, `pip list --outdated`…) derrière une seule " +
          "interface. Aucun protocole inventé, aucun cache de versions.",
      },
      platforms: {
        q: `Ça marche sur macOS et Linux${NB}?`,
        a:
          `Oui. Sur macOS en natif${NB}: formules et casks Homebrew, MacPorts et le Mac App ` +
          "Store, sur Apple Silicon et Intel. Sur Linux, Homebrew/Linuxbrew et Nix couvrent " +
          "la couche OS, et un binaire installé par la distribution est rendu à `apt` ou " +
          "`dnf`. Tout ce qui se trouve au-dessus de la couche OS — npm, pip, cargo, helm, " +
          "VS Code… — se comporte de la même façon sur les trois systèmes.",
      },
      install: {
        q: `Comment installer gup${NB}?`,
        a:
          "`{installCommand}`, puis `gup doctor` pour voir quels providers sont détectés. " +
          "Node.js {nodeEngine} ou plus récent requis.",
      },
      ci: {
        q: `Peut-on utiliser gup en CI${NB}?`,
        a:
          "Oui. `gup list --json --fast` donne une sortie lisible par une machine et " +
          "`gup update --all -y` saute toutes les confirmations. Les codes de sortie sont " +
          `stables${NB}: \`0\` succès, \`1\` échec partiel, \`2\` arguments invalides.`,
      },
      count: {
        q: `Combien de gestionnaires de paquets gup couvre-t-il${NB}?`,
        a:
          `{providers} providers, un module isolé chacun${NB}: winget, scoop, chocolatey, ` +
          "Homebrew, MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, dotnet tools, helm, " +
          "kubectl, terraform, les extensions VS Code, les IDE JetBrains, les distributions " +
          "WSL et bien d'autres.",
      },
      security: {
        q: `Est-ce sûr de le lancer${NB}?`,
        a:
          "Chaque sous-processus passe par un seul point d'entrée, en vecteur d'arguments " +
          "strict — jamais via un shell — avec une allowlist pinnée par les tests. CodeQL, " +
          "Semgrep, gitleaks, audit-ci et Dependabot tournent en continu. gup n'envoie " +
          "aucune télémétrie.",
      },
      topgrade: {
        q: `Quelle différence avec topgrade${NB}?`,
        a:
          `topgrade lance les mises à jour${NB}; gup répond d'abord à «${NB}qu'est-ce qui ` +
          `est en retard, et de quelle version à quelle version${NB}». Le scan est une ` +
          "étape à part, avec une sortie JSON, une sélection paquet par paquet, des cibles " +
          "`provider:package`, des planifications par paquet et un historique local " +
          "consultable.",
      },
      language: {
        q: `Dans quelle langue est l'interface${NB}?`,
        a:
          "L'interface est en français pour l'instant. Commandes, options et sortie JSON ne " +
          "dépendent pas de la langue, et ce site existe en huit langues.",
      },
    },
  },
  install: {
    kicker: "06 / INSTALLATION",
    title: "Trente secondes, et tu sais tout.",
    lead:
      "Une installation npm, une commande, et la liste complète de ce qui traîne sur ta " +
      "machine.",
    examples: {
      menu: "Interface plein écran",
      listFast: "Ce qui traîne, scan rapide",
      updateAll: "Tout, sans confirmation (CI)",
      target: "Un paquet, sans scan",
      doctor: "Ce qui est détecté, et comment installer le reste",
    },
    support: {
      title: `Le projet t'est utile${NB}?`,
      text:
        "gup est gratuit, MIT, et maintenu sur mon temps libre. S'il t'a fait gagner du " +
        "temps, un café ou une étoile aide à faire avancer les {providers} providers.",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "Une étoile sur GitHub",
    },
  },
  footer: {
    tagline:
      "Global Updater — une CLI pour {providers} sources d'installation. TypeScript strict, " +
      "ESM, Node ≥ {node}.",
    columns: { project: "Projet", docs: "Documentation", technical: "Technique" },
    links: {
      repo: "Code source · GitHub",
      npm: "Paquet · npm",
      issues: "Issues",
      support: "Assistance",
      contributing: "Contribuer",
      conduct: "Code de conduite",
      releases: "Notes de version",
      installation: "Installation",
      cli: "Référence CLI",
      providers: "Catalogue des providers",
      scope: "Périmètre",
      architecture: "Architecture",
      howItWorks: "Comment gup fonctionne",
      security: "Sécurité",
      llms: "llms.txt",
    },
    languages: "Langues",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
