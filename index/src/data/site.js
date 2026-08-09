/**
 * Canonical URLs, navigation and the footer link graph.
 *
 * Every absolute URL on the page comes from here. If the deploy target moves,
 * this file plus index.html's canonical/OG block, static/robots.txt,
 * static/sitemap.xml and static/llms.txt are the full set to update — the same
 * contract the comment at the top of index.html records.
 */

export const SITE_URL = "https://lindecker-charles.github.io/gup/";
export const REPO_URL = "https://github.com/LINDECKER-Charles/gup";
export const NPM_URL = "https://www.npmjs.com/package/@charles_lindecker/gup";
export const KOFI_URL = "https://ko-fi.com/charleslindecker";
export const SPONSORS_URL = "https://github.com/sponsors/LINDECKER-Charles";
export const AUTHOR_URL = "https://github.com/LINDECKER-Charles";

/** A document in the repo, at the pinned default branch. */
const doc = (path) => `${REPO_URL}/blob/main/${path}`;

export const DOCS = {
  installation: doc("docs/installation.md"),
  cli: doc("docs/cli-reference.md"),
  providers: doc("docs/providers-catalog.md"),
  architecture: doc("docs/architecture.md"),
  howItWorks: doc("docs/how-gup-works.md"),
  scope: doc("docs/scope.md"),
  security: doc("SECURITY.md"),
  contributing: doc("CONTRIBUTING.md"),
  releases: `${REPO_URL}/tree/main/docs/releases`,
  issues: `${REPO_URL}/issues`,
};

/**
 * In-page sections, in document order. `id` is the anchor, `label` is what the
 * header shows. `legacyIds` are anchors an earlier version of this page used:
 * they are still rendered as empty targets so links already published or
 * indexed keep landing on the right section.
 */
export const SECTIONS = [
  { id: "pourquoi", label: "Pourquoi", legacyIds: ["problem"] },
  { id: "plateformes", label: "Plateformes" },
  { id: "usage", label: "Usage", legacyIds: ["modes"] },
  { id: "architecture", label: "Architecture" },
  { id: "cycle", label: "Cycle", legacyIds: ["lifecycle"] },
  { id: "couverture", label: "Couverture", legacyIds: ["providers"] },
  { id: "securite", label: "Sécurité" },
  { id: "install", label: "Install" },
];

/** The four the header has room for. */
export const NAV_LINKS = SECTIONS.filter((s) =>
  ["pourquoi", "plateformes", "architecture", "securite"].includes(s.id),
).map((s) => ({ href: `#${s.id}`, label: s.label }));

export const FOOTER_COLUMNS = [
  {
    title: "Projet",
    links: [
      { href: REPO_URL, label: "Code source · GitHub" },
      { href: NPM_URL, label: "Package · npm" },
      { href: DOCS.issues, label: "Issues" },
      { href: DOCS.contributing, label: "Contribuer" },
      { href: DOCS.releases, label: "Notes de version" },
    ],
  },
  {
    title: "Documentation",
    links: [
      { href: DOCS.installation, label: "Installation" },
      { href: DOCS.cli, label: "Référence CLI" },
      { href: DOCS.providers, label: "Catalogue des providers" },
      { href: DOCS.scope, label: "Périmètre" },
    ],
  },
  {
    title: "Technique",
    links: [
      { href: DOCS.architecture, label: "Architecture" },
      { href: DOCS.howItWorks, label: "Comment gup fonctionne" },
      { href: DOCS.security, label: "Sécurité" },
      { href: `${SITE_URL}llms.txt`, label: "llms.txt" },
    ],
  },
];
