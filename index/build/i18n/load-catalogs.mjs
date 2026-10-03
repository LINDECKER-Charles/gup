/**
 * Every raw catalog, keyed by locale id. Static imports on purpose: the build,
 * the dev plugin (through Vite's module graph, so an edited catalog reloads)
 * and the tests all read the same objects, and nothing under src/ may import
 * this module — the client bundle never carries a catalog.
 *
 * A locale is registered in two places that must agree: here and in
 * src/i18n/locales.js. build/page-context.mjs refuses to build when they
 * disagree.
 */
import bn from "../../src/i18n/catalogs/bn.js";
import en from "../../src/i18n/catalogs/en.js";
import es from "../../src/i18n/catalogs/es.js";
import fr from "../../src/i18n/catalogs/fr.js";
import hi from "../../src/i18n/catalogs/hi.js";
import pt from "../../src/i18n/catalogs/pt.js";
import zh from "../../src/i18n/catalogs/zh.js";

export const CATALOGS = Object.freeze({ en, zh, hi, es, fr, bn, pt });
