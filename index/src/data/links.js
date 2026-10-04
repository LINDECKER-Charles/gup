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

/** A document in the repository, at the default branch. */
const doc = (path) => `${REPO}/blob/main/${path}`;

export const LINKS = Object.freeze({
  origin: ORIGIN,
  basePath: BASE_PATH,
  siteUrl: SITE_URL,
  repo: REPO,
  npm: NPM,
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
  }),
});
