/**
 * All page copy, kept out of the components so wording changes never touch
 * JSX. Numbers come from data/facts.js, which is generated from the repo —
 * never hardcode a provider count or a version here.
 */
import { facts } from "./facts.js";

const N = facts.providerCount;

export const hero = {
  eyebrow: `NOUVEAU — MACOS EN NATIF : BREW, CASKS, MAS, MACPORTS`,
  title: ["Une commande.", `${N} sources`, "à jour."],
  lead: {
    before: "Arrête de courir après ",
    /** Rendered bold — the three names people actually search for. */
    strong: ["winget", "brew", "npm"],
    after: ", pip, cargo et helm. Un seul binaire les scanne tous, en parallèle, et te montre ce qui traîne.",
  },
  trust: ["MIT · open source", `Node ≥ ${facts.nodeMajor}`, "0 télémétrie"],
  scan: {
    title: "SCAN PARALLÈLE",
    meta: "pLimit(4)",
    /** Illustrative: the panel is a visual, not a benchmark. */
    outdated: "23 à jour disponibles",
    rotator: [
      "winget",
      "Homebrew",
      "npm-g",
      "pip",
      "cargo",
      "helm",
      "kubectl",
      "VS Code",
      "brew-cask",
      "winget",
    ],
  },
};

/**
 * Stat bar. Each value is checkable against the repo: the provider count comes
 * from ALL_PROVIDERS, "4 méthodes" is the Provider contract (isAvailable,
 * listOutdated, update, updateAll), "3 OS" is package.json `os`, and gup ships
 * no background process at all.
 */
export const stats = [
  { value: N, prefix: "", suffix: "", label: "providers isolés" },
  { value: 4, prefix: "", suffix: "", label: "méthodes par contrat" },
  { value: 3, prefix: "", suffix: "", label: "OS supportés" },
  { value: 0, prefix: "", suffix: "", label: "daemon · 0 polling" },
];

export const why = {
  label: "01 / POURQUOI",
  title: ["Quinze commandes.", "Aucune ne couvre tout."],
  commands: [
    "winget upgrade",
    "brew upgrade && brew upgrade --cask",
    "npm update -g",
    "pip list --outdated",
    "cargo install-update -a",
    "code --list-extensions",
  ],
  more: "+ 40 autres selon ta machine",
  after: [
    { key: "fail-soft", text: "un provider qui pète n'affecte que sa cellule" },
    { key: "pLimit(4)", text: "concurrence bornée par défaut" },
    { key: "opt-in", text: "destructif uniquement à la demande" },
  ],
};

export const usage = {
  label: "03 / USAGE",
  title: ["Le menu, la CI,", "ou la chirurgie."],
  modes: [
    {
      ix: "MODE 01",
      title: "Menu interactif",
      cmd: "gup",
      desc: "Scan auto puis REPL : Review, Update selected, Update all, Providers, Options.",
    },
    {
      ix: "MODE 02",
      title: "Non-interactif",
      cmd: "gup update --all -y",
      desc: "Pour la CI et les scripts. Sortie JSON pipeable, exit codes stables.",
    },
    {
      ix: "MODE 03",
      title: "Ciblé",
      cmd: "gup update brew:ripgrep",
      desc: "Bypass complet du scan. Syntaxe provider:package, autant de cibles que voulu.",
    },
  ],
};

export const architecture = {
  label: "04 / ARCHITECTURE",
  title: "Un orchestrateur, pas un gestionnaire.",
  /**
   * One narration per scroll beat; index 0 is the resting state, and the one
   * rendered when there is no scroll to read (prerendered HTML, reduced
   * motion) — which is why the "keep scrolling" nudge is a separate string
   * shown only when the stage is actually interactive.
   */
  scrollHint: "Fais défiler pour suivre une commande de bout en bout.",
  beats: [
    "gup shell-out sur les commandes natives, fan-out en parallèle, homogénéise les sorties — de l'argv au runner, sans état partagé ni daemon.",
    "commander parse l'argv et route vers menu, list, update ou doctor. Aucun état global, aucun daemon derrière.",
    `core/registry détient ALL_PROVIDERS[] et lance le fan-out borné à pLimit(4). Chaque cellule est enveloppée d'un try/catch : un provider qui plante n'affecte que lui-même.`,
    `Les ${N} providers répondent en parallèle. Chacun renvoie ses OutdatedPackage[] ou un tableau vide — jamais une exception.`,
    "core/runner est le point unique de shell-out : execa en argv-vector, UTF-8, windowsHide, jamais shell: true. Puis stdout/stderr sont streamés en direct.",
  ],
  fanout: [
    "winget",
    "brew",
    "brew-cask",
    "npm-g",
    "pip",
    "pipx",
    "cargo",
    "helm",
    "kubectl",
    "vscode-ext",
  ],
  cards: [
    {
      title: "Provider",
      desc: "Un module isolé par source. Quatre méthodes : isAvailable, listOutdated, update, updateAll.",
    },
    {
      title: "Registry",
      desc: "ALL_PROVIDERS[] statique, fan-out par pLimit(4), try/catch enveloppant sur chaque cellule.",
    },
    {
      title: "Runner",
      desc: "Point unique de shell-out. execa en UTF-8, windowsHide, argv-vector, jamais shell: true.",
    },
    {
      title: "UI",
      desc: "Spinner ora avec in-flight set, table cli-table3, prompts @inquirer groupés par provider.",
    },
  ],
};

export const lifecycle = {
  label: "05 / CYCLE DE VIE",
  title: "Du prompt à l'exit code.",
  steps: [
    {
      num: "01 · DETECT",
      title: "isAvailable()",
      desc: "Probe parallèle, where/which en ms. Pas de scan tant que ce n'est pas vert.",
    },
    {
      num: "02 · PLAN",
      title: "filtres + flags",
      desc: "--fast retire les providers lents, --provider restreint, --only cible.",
    },
    {
      num: "03 · SCAN",
      title: "listOutdated()",
      desc: "pLimit(4), try/catch global, pkg.manual filtré une fois pour toutes.",
    },
    {
      num: "04 · SELECT",
      title: "checkbox @inquirer",
      desc: "Groupé par provider, séparateurs, notes en gris. Confirme puis applique.",
    },
    {
      num: "05 · UPDATE",
      title: "runInherit()",
      desc: "stdout/stderr streamés en direct, puis chaque tentative est journalisée en JSONL.",
    },
  ],
};

export const coverage = {
  label: "06 / COUVERTURE",
  caption: "providers isolés",
  lead: {
    before: "Un fichier par source dans ",
    code: "src/providers/",
    after: ". Zéro import croisé, zéro état partagé.",
  },
  catalogLabel: "Voir le catalogue complet",
  /** Domain folders under src/providers/. */
  categories: [
    "OS",
    "WSL",
    "Node",
    "Python",
    ".NET / PHP",
    "JVM",
    "Rust",
    "Toolchain",
    "Cloud",
    "IaC",
    "Kubernetes",
    "Containers",
    "Security",
    "Dev CLIs",
    "IDE",
    "Editor plugins",
    "Embedded",
    "Shell",
  ],
  managers: [
    "winget",
    "scoop",
    "chocolatey",
    "Homebrew",
    "Casks",
    "MacPorts",
    "Mac App Store",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "pip",
    "pipx",
    "uv",
    "cargo",
    "gem",
    "composer",
    "dotnet tools",
    "helm",
    "kubectl",
    "terraform",
    "VS Code",
    "JetBrains",
    "gh extensions",
  ],
};

export const security = {
  label: "07 / SÉCURITÉ",
  title: ["Il lance des", "commandes en root."],
  lead: "Alors le shell-out passe par un point unique, en argv-vector strict, avec une allowlist pinnée par les tests. Le reste est vérifié à chaque commit.",
  cards: [
    {
      label: "Exécution",
      desc: "Subprocess en argv-vector strict, jamais shell: true. Un seul point de shell-out, allowlist pinnée par les tests.",
      tags: ["execa", "argv-vector", "no shell"],
    },
    {
      label: "Chaîne d'approvisionnement",
      desc: "Fetch HTTPS-only, dépendances auditées à chaque build, mises à jour surveillées en continu.",
      tags: ["audit-ci", "Dependabot", "gitleaks"],
    },
    {
      label: "Analyse statique",
      desc: "Trois analyseurs en CI sur chaque commit, plus une suite Vitest dédiée aux invariants de sécurité.",
      tags: ["CodeQL", "Semgrep", "eslint-security"],
    },
  ],
};

export const install = {
  label: "08 / INSTALL",
  title: ["Trente secondes,", "et tu sais tout."],
  lead: "Une installation npm, une commande, et la liste complète de ce qui traîne sur ta machine.",
  trust: [
    `Node ≥ ${facts.nodeMajor}`,
    "Windows · macOS · Linux · WSL",
    "MIT",
    "0 config",
  ],
  examples: [
    { cmd: "gup list --fast", desc: "Ce qui traîne, scan rapide" },
    { cmd: "gup list --json", desc: "Sortie machine-readable" },
    { cmd: "gup update --all -y", desc: "CI-safe, sans prompt" },
    { cmd: "gup update brew:fzf", desc: "Chirurgical, sans scan" },
    {
      cmd: "gup list --provider brew npm-g",
      desc: "Restreindre à quelques sources",
    },
    { cmd: "gup doctor", desc: "Détecté, manquant, comment installer" },
  ],
  support: {
    title: "Le projet t'est utile ?",
    text: `gup est gratuit, MIT, et maintenu sur mon temps libre. Si l'outil t'a fait gagner du temps, tu peux me payer un café — ça aide à garder le rythme sur les ${N} providers.`,
  },
};

export const stickyCta = { title: "Prêt en 30 secondes" };

export const footer = {
  tagline: `Global Updater — CLI orchestratrice pour ${N} sources d'installation. TypeScript strict, ESM, Node ≥ ${facts.nodeMajor}.`,
  legal: "© 2026 Charles Lindecker · MIT",
  stack: "TypeScript strict · execa · commander · @inquirer/prompts",
};
