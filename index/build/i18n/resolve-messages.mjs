/**
 * Turns a raw catalog into the resolved message tree a page ships.
 *
 * Everything locale-sensitive happens here, in Node, at build time:
 * placeholders are filled, plural forms are selected with Intl.PluralRules,
 * and the markup is validated. The page then embeds the resolved strings and
 * the client hydrates from exactly what the server rendered — no ICU data, no
 * i18n runtime and no possible Node/browser drift in the bundle.
 *
 * Every defect fails the build with `<locale>:<key.path>: <reason>`, never a
 * degraded page: unknown placeholder, missing value, missing plural category,
 * malformed markup, or markup inside a plain-text namespace.
 *
 * @typedef {import("../../src/i18n/parse-rich.js").RichToken} RichToken
 *
 * @typedef {object} ResolveOptions
 * @property {Readonly<Record<string, string>>} vars  One value per placeholder name.
 * @property {string} pluralLocale  BCP 47 tag for Intl.PluralRules (Locale.htmlLang).
 * @property {string} localeId      Prefix of every error message.
 */
import { parseRich } from "../../src/i18n/parse-rich.js";

/** The closed placeholder vocabulary, filled by build/page-context.mjs. */
const VAR_NAMES = new Set([
  "providers",
  "version",
  "node",
  "nodeEngine",
  "packageName",
  "installCommand",
  "year",
  "endonym",
]);

/** Namespaces rendered where markup cannot exist: <head>, aria-labels, <noscript>. */
const PLAIN_ROOTS = new Set(["meta", "common", "nav"]);

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
const PLACEHOLDER = /\{([^{}]*)\}/g;

function fail(path, options, reason) {
  throw new Error(`${options.localeId}:${path.join(".")}: ${reason}`);
}

const isRecord = (node) => typeof node === "object" && node !== null && !Array.isArray(node);
const isPlural = (node) => isRecord(node) && "$count" in node;

function fillPlaceholder(name, path, options) {
  if (!VAR_NAMES.has(name)) fail(path, options, `unknown placeholder {${name}}`);
  const value = options.vars[name];
  if (typeof value !== "string") fail(path, options, `no value for placeholder {${name}}`);
  return value;
}

function checkMarkup(text, path, options) {
  let tokens;
  try {
    tokens = parseRich(text);
  } catch (error) {
    fail(path, options, error.message);
  }
  if (PLAIN_ROOTS.has(path[0]) && tokens.some((token) => token.kind !== "text")) {
    fail(path, options, "markup in a plain-text key");
  }
}

function resolveString(text, path, options) {
  const filled = text.replace(PLACEHOLDER, (_, name) => fillPlaceholder(name, path, options));
  checkMarkup(filled, path, options);
  return filled;
}

/** Validates every form, then returns the one Intl.PluralRules selects. */
function resolvePlural(node, path, options) {
  const rules = new Intl.PluralRules(options.pluralLocale);
  const required = rules.resolvedOptions().pluralCategories;
  const forms = Object.keys(node).filter((key) => key !== "$count");
  for (const form of forms) {
    if (!PLURAL_CATEGORIES.has(form) || !required.includes(form)) {
      fail(path, options, `plural form "${form}" is not used by ${options.pluralLocale}`);
    }
  }
  const missing = required.filter((category) => typeof node[category] !== "string");
  if (missing.length) fail(path, options, `missing plural form(s): ${missing.join(", ")}`);
  const resolved = Object.fromEntries(
    required.map((category) => [category, resolveString(node[category], path, options)]),
  );
  const count = Number(fillPlaceholder(node.$count, path, options));
  if (!Number.isFinite(count)) fail(path, options, `{${node.$count}} is not a number`);
  return resolved[rules.select(count)];
}

function resolveNode(node, path, options) {
  if (typeof node === "string") return resolveString(node, path, options);
  if (Array.isArray(node)) {
    return node.map((item, index) => resolveNode(item, [...path, String(index)], options));
  }
  if (isPlural(node)) return resolvePlural(node, path, options);
  if (isRecord(node)) {
    const entries = Object.entries(node);
    return Object.fromEntries(
      entries.map(([key, value]) => [key, resolveNode(value, [...path, key], options)]),
    );
  }
  return fail(path, options, `unsupported value ${JSON.stringify(node)}`);
}

/**
 * @param {object} raw  A catalog module's default export.
 * @param {ResolveOptions} options
 * @returns {object}    Same tree, every leaf a plain string (markup kept).
 */
export function resolveMessages(raw, options) {
  return resolveNode(raw, [], options);
}
