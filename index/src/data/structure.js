/**
 * The language-neutral structure of the page: section order and anchors,
 * feature cards, FAQ order, example commands, footer link graph.
 *
 * Structure and commands live here once; the catalogs only hold words, keyed
 * by the same ids. A command typo is fixed in one file, not in eight.
 *
 * `legacyIds` are fragments earlier versions of the page published (the old
 * French section ids among them): each is rendered as an empty alias target
 * at the top of its section, so bookmarked and indexed links keep landing.
 */
export const STRUCTURE = Object.freeze({
  sections: Object.freeze([
    { id: "features", isInNav: true, legacyIds: ["pourquoi", "problem"] },
    { id: "coverage", isInNav: true, legacyIds: ["plateformes", "couverture", "providers"] },
    {
      id: "how",
      isInNav: true,
      legacyIds: ["usage", "modes", "architecture", "cycle", "lifecycle"],
    },
    { id: "security", isInNav: false, legacyIds: ["securite"] },
    { id: "faq", isInNav: true, legacyIds: [] },
    { id: "install", isInNav: false, legacyIds: [] },
  ]),
  /** Only the three flagship features carry a "New" badge. */
  features: Object.freeze([
    { id: "inline", icon: "pane", isNew: true },
    { id: "select", icon: "check", isNew: false },
    { id: "schedule", icon: "clock", isNew: true },
    { id: "journal", icon: "chart", isNew: false },
    { id: "report", icon: "browser", isNew: true },
    { id: "themes", icon: "contrast", isNew: false },
    { id: "os", icon: "os", isNew: false },
    { id: "script", icon: "terminal", isNew: false },
  ]),
  howSteps: Object.freeze(["scan", "choose", "update"]),
  security: Object.freeze([
    { id: "execution", tags: ["execa", "argv", "no shell"] },
    { id: "supplyChain", tags: ["audit-ci", "Dependabot", "gitleaks"] },
    { id: "analysis", tags: ["CodeQL", "Semgrep", "eslint-security"] },
  ]),
  faq: Object.freeze([
    "replace",
    "platforms",
    "install",
    "ci",
    "count",
    "security",
    "topgrade",
    "language",
  ]),
  examples: Object.freeze([
    { id: "menu", cmd: "gup" },
    { id: "listFast", cmd: "gup list --fast" },
    { id: "updateAll", cmd: "gup update --all -y" },
    { id: "target", cmd: "gup update brew:fzf" },
    { id: "doctor", cmd: "gup doctor" },
  ]),
  /** Footer columns; link ids index LINKS.resources and `footer.links.*`. */
  footer: Object.freeze([
    { id: "project", links: ["repo", "npm", "issues", "contributing", "releases"] },
    { id: "docs", links: ["installation", "cli", "providers", "scope"] },
    { id: "technical", links: ["architecture", "howItWorks", "security", "llms"] },
  ]),
});
