/**
 * Every absolute URL the site states, in one place: canonical/hreflang/OG
 * (build/seo/*), the sitemap, the JSON-LD graph and the page's own links.
 *
 * If the deploy target moves (custom domain, another repo), change ORIGIN and
 * BASE_PATH here, then static/robots.txt, static/llms*.txt and
 * static/public/site.webmanifest — the only files that spell the URL out.
 */
import { facts } from "./facts.js";

const ORIGIN = "https://lindecker-charles.github.io";
const BASE_PATH = "/gup/";
const SITE_URL = `${ORIGIN}${BASE_PATH}`;
const REPO = "https://github.com/LINDECKER-Charles/gup";
const NPM = `https://www.npmjs.com/package/${facts.packageName}`;

/** Where the feedback service answers; local development points it at 127.0.0.1:8787. */
const DEFAULT_FEEDBACK_API = "https://feedback.global-updater.com";

/**
 * The feedback service origin: `VITE_FEEDBACK_API` when set, the default
 * otherwise. Read from Vite's replaced `import.meta.env` in the bundles and
 * from the process environment in the prerender, which runs in plain Node —
 * so the CSP the prerender writes always names the very origin the bundle
 * posts to.
 */
function readFeedbackApi() {
  const configured =
    import.meta.env?.VITE_FEEDBACK_API ?? globalThis.process?.env?.VITE_FEEDBACK_API;
  return new URL(configured || DEFAULT_FEEDBACK_API).origin;
}

/** A document in the repository, at the default branch. */
const doc = (path) => `${REPO}/blob/main/${path}`;

export const LINKS = Object.freeze({
  origin: ORIGIN,
  basePath: BASE_PATH,
  siteUrl: SITE_URL,
  repo: REPO,
  npm: NPM,
  feedbackApi: readFeedbackApi(),
  kofi: "https://ko-fi.com/charleslindecker",
  sponsors: "https://github.com/sponsors/LINDECKER-Charles",
  author: "https://github.com/LINDECKER-Charles",
  npmProfile: "https://www.npmjs.com/~charles_lindecker",
  /** Link targets keyed like `footer.links.*` in the catalogs. All in English. */
  resources: Object.freeze({
    repo: REPO,
    npm: NPM,
    issues: `${REPO}/issues`,
    support: doc(".github/SUPPORT.md"),
    contributing: doc(".github/CONTRIBUTING.md"),
    conduct: doc(".github/CODE_OF_CONDUCT.md"),
    releases: `${REPO}/tree/main/docs/releases`,
    installation: doc("docs/guide/installation.md"),
    cli: doc("docs/guide/cli-reference.md"),
    providers: doc("docs/guide/providers-catalog.md"),
    scope: doc("docs/guide/scope.md"),
    architecture: doc("docs/development/architecture.md"),
    howItWorks: doc("docs/development/how-gup-works.md"),
    security: doc(".github/SECURITY.md"),
    llms: `${SITE_URL}llms.txt`,
    /** On-page anchor: the footer links to the form like to any other resource. */
    feedback: "#feedback",
  }),
});
