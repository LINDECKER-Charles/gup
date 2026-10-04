/**
 * llms.txt sorts the providers into categories by hand. Where a category is
 * one of the registry's domains (the folders under src/providers/), every
 * provider id it lists must belong to that domain: an assistant reading the
 * file answers "which cloud CLIs does gup update?" from it. Items that are not
 * ids ("gh extensions", "helm plugins") are prose, out of this check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { providersByDomain } from "../../src/data/facts.js";

const LLMS = readFileSync(new URL("../../static/llms.txt", import.meta.url), "utf8");

/** The categories named after one domain; the others mix several or describe a platform. */
const CATEGORY_DOMAINS = {
  Node: "node",
  Python: "python",
  ".NET / PHP": "dotnet-php",
  JVM: "jvm",
  Rust: "rust",
  "Other languages": "lang-other",
  Toolchains: "toolchain",
  "Cloud CLIs": "cloud",
  IaC: "iac",
  Kubernetes: "kubernetes",
  Containers: "containers",
  Security: "security",
  "Dev CLIs": "dev-cli",
  Shell: "shell",
  "Embedded / mobile": "embedded-mobile",
};

const DOMAIN_OF = new Map(
  Object.entries(providersByDomain).flatMap(([domain, ids]) => ids.map((id) => [id, domain])),
);

/** "- **Cloud CLIs**: az, gcloud, …" lines of the providers section, by category. */
function categories() {
  const section = LLMS.split(/^## /m).find((part) => part.startsWith("Supported providers"));
  assert.ok(section, "llms.txt has a Supported providers section");
  const lines = [...section.matchAll(/^- \*\*(.+?)\*\*: (.+)$/gm)];
  return new Map(lines.map(([, name, list]) => [name, list.split(/,\s*/).map((item) => item.trim())]));
}

test("llms.txt keeps every category named after a domain", () => {
  const listed = categories();
  for (const name of Object.keys(CATEGORY_DOMAINS)) assert.ok(listed.has(name), name);
});

test("llms.txt files every provider id under its own domain's category", () => {
  const misfiled = [...categories()]
    .filter(([name]) => name in CATEGORY_DOMAINS)
    .flatMap(([name, items]) =>
      items
        .filter((item) => DOMAIN_OF.has(item) && DOMAIN_OF.get(item) !== CATEGORY_DOMAINS[name])
        .map((item) => `${item} under ${name}, but in ${DOMAIN_OF.get(item)}`),
    );
  assert.deepEqual(misfiled, []);
});
