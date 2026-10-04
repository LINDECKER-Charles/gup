/**
 * What the site states about the provider registry, read from the CLI's own
 * sources: how many providers ALL_PROVIDERS registers, their ids by domain
 * folder, and how many of them gup supports on each system the site shows.
 *
 * A regex over the TypeScript sources rather than an import: the CLI is
 * compiled by tsup, and making the landing build depend on the CLI build would
 * couple two independent pipelines for a handful of numbers.
 *
 * Walked from ALL_PROVIDERS, never from the filesystem: src/providers/ holds
 * provider files the registry does not instantiate, and counting them would
 * publish support the CLI does not give.
 *
 * Per-system support comes from each provider's one-line declaration,
 * `readonly platforms = PLATFORMS.<set>;` (src/core/platform/platforms.ts,
 * kept on one line for this reader); no declaration means every platform.
 */

/** The systems each named platform set covers, among the three the site shows. */
const SYSTEMS_OF_SET = Object.freeze({
  windows: Object.freeze(["windows"]),
  macos: Object.freeze(["macos"]),
  notWindows: Object.freeze(["macos", "linux"]),
});
const SYSTEMS = Object.freeze(["windows", "macos", "linux"]);

const REGISTRY_START = "export const ALL_PROVIDERS";
const INSTANTIATION = /^\s+new ([A-Za-z0-9_]+)\(\),$/gm;
const PROVIDER_IMPORT =
  /import\s*\{\s*([A-Za-z0-9_,\s]+?)\s*\}\s*from\s*"\.\.\/providers\/([^"]+)\.js"/g;
const PROVIDER_ID = /\bid\s*=\s*"([a-z0-9.@/-]+)"/i;
const PLATFORM_DECLARATION = /^\s*readonly platforms = PLATFORMS\.([A-Za-z]+);$/m;
const ANY_PLATFORM_FIELD = /^\s*readonly platforms\b/m;

const fileOf = (relative) => `src/providers/${relative}.ts`;

/** The systems a provider runs on, from its `platforms` declaration. */
function systemsOf(relative, source) {
  const set = source.match(PLATFORM_DECLARATION)?.[1];
  if (set === undefined) {
    if (!ANY_PLATFORM_FIELD.test(source)) return SYSTEMS;
    throw new Error(
      `read-registry: ${fileOf(relative)} declares its platforms in a form the site cannot ` +
        "read — keep it `readonly platforms = PLATFORMS.<set>;` on one line.",
    );
  }
  if (!Object.hasOwn(SYSTEMS_OF_SET, set)) {
    throw new Error(
      `read-registry: ${fileOf(relative)} declares PLATFORMS.${set}, a set the site does ` +
        "not know — add it to SYSTEMS_OF_SET.",
    );
  }
  return SYSTEMS_OF_SET[set];
}

function describeProvider(relative, source) {
  const id = source.match(PROVIDER_ID)?.[1];
  if (!id) throw new Error(`read-registry: no provider id in ${fileOf(relative)}`);
  // `self.ts` sits at the root of src/providers/: gup updating itself.
  const domain = relative.includes("/") ? relative.split("/")[0] : "self";
  return { id, domain, systems: systemsOf(relative, source) };
}

/** Provider modules an instantiated class is imported from, in import order. */
function registeredModules(registrySource, instantiated) {
  return [...registrySource.matchAll(PROVIDER_IMPORT)]
    .filter(([, symbols]) => symbols.split(",").some((s) => instantiated.has(s.trim())))
    .map(([, , relative]) => relative);
}

function groupByDomain(providers) {
  const groups = {};
  for (const { id, domain } of providers) (groups[domain] ??= []).push(id);
  for (const ids of Object.values(groups)) ids.sort();
  return groups;
}

function countBySystem(providers) {
  return Object.fromEntries(
    SYSTEMS.map((system) => [system, providers.filter((p) => p.systems.includes(system)).length]),
  );
}

/**
 * @param {string} registrySource  The text of src/core/registry.ts.
 * @param {(relative: string) => string} readProvider  The text of src/providers/<relative>.ts.
 * @returns {{ providerCount: number, providersByDomain: Record<string, string[]>,
 *   providersBySystem: Record<"windows" | "macos" | "linux", number> }}
 */
export function readRegistry(registrySource, readProvider) {
  const body = registrySource.slice(registrySource.indexOf(REGISTRY_START));
  const classes = [...body.matchAll(INSTANTIATION)].map(([, name]) => name);
  const providers = registeredModules(registrySource, new Set(classes)).map((relative) =>
    describeProvider(relative, readProvider(relative)),
  );
  if (providers.length !== classes.length) {
    throw new Error(
      `read-registry: found ${providers.length} provider modules but ALL_PROVIDERS holds ` +
        `${classes.length} entries. The site must not publish a list that disagrees with ` +
        "the count.",
    );
  }
  return {
    providerCount: classes.length,
    providersByDomain: groupByDomain(providers),
    providersBySystem: countBySystem(providers),
  };
}
