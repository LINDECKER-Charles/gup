/**
 * The double-at placeholder vocabulary, and the substitution itself.
 *
 * index.html and every text asset under static/ (llms.txt, llms-full.txt,
 * sitemap.xml, robots.txt, 404.html, site.webmanifest) state the same handful of
 * facts: the published version, the provider count, the minimum Node, and when
 * the page last changed. Those had drifted to "v0.1.0 / ~130 sources / Node
 * >= 20" across forty-odd hand-maintained copies. They are now written once,
 * here, from src/data/facts.js — which is itself generated from the repo.
 *
 * vite.config.js applies them to index.html (dev and build);
 * scripts/stamp-static.mjs applies them to the built static assets.
 */
import { facts, providersByDomain } from "../src/data/facts.js";

/** Human labels for the domain folders under src/providers/. */
const DOMAIN_LABELS = {
  os: "OS package managers (Windows, macOS, Linux)",
  wsl: "WSL — kernel and the managers inside your distros",
  node: "Node.js",
  python: "Python",
  "dotnet-php": ".NET and PHP",
  jvm: "JVM",
  rust: "Rust",
  "lang-other": "Other languages",
  toolchain: "Version managers and toolchains",
  cloud: "Cloud CLIs",
  iac: "Infrastructure as code",
  kubernetes: "Kubernetes",
  containers: "Containers",
  security: "Security tooling",
  "dev-cli": "Developer CLIs",
  ide: "IDEs and editors",
  "editor-plugins": "Editor plugin managers",
  "embedded-mobile": "Embedded and mobile",
  shell: "Shell and prompt",
  self: "gup itself",
};

/** The full provider inventory as a markdown list, for llms-full.txt. */
function providerInventory() {
  return Object.entries(providersByDomain)
    .map(([domain, ids]) => {
      const label = DOMAIN_LABELS[domain] ?? domain;
      return `- **${label}** (${ids.length}): \`${ids.join("`, `")}\``;
    })
    .join("\n");
}

/** @param modifiedIso ISO timestamp of the last content change. */
export function buildTokens(modifiedIso) {
  return {
    "@@PROVIDERS@@": String(facts.providerCount),
    "@@VERSION@@": facts.version,
    "@@PACKAGE@@": facts.packageName,
    "@@NODE@@": facts.nodeEngine,
    "@@NODE_MAJOR@@": String(facts.nodeMajor),
    "@@MODIFIED@@": modifiedIso,
    "@@LASTMOD@@": modifiedIso.slice(0, 10),
    "@@PROVIDER_INVENTORY@@": providerInventory(),
  };
}

/**
 * Replaces every token, then fails if any placeholder survived — a typo in a
 * token name must break the build rather than ship a literal "@@FOO@@" to
 * Google.
 */
export function applyTokens(text, tokens, label) {
  let out = text;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.replaceAll(token, value);
  }
  const leftover = out.match(/@@[A-Z_]+@@/g);
  if (leftover) {
    throw new Error(
      `stamp: unresolved placeholder(s) in ${label}: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return out;
}
