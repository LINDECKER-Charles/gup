/**
 * What the CLI's link prefills: `?install=<uuid>&version=<x.y.z>&platform=<os>`.
 * Each value is checked against the service's own rule before it reaches the
 * form — a hand-edited or malicious link can fill nothing the service would
 * refuse, and nothing that is not plain text.
 */
import { FEEDBACK_PLATFORMS, LIMITS, PATTERNS, QUERY } from "./rules.js";

const RULES = Object.freeze({
  installId: {
    param: QUERY.installId,
    isValid: (value) => PATTERNS.installId.test(value),
    normalize: (value) => value.toLowerCase(),
  },
  gupVersion: {
    param: QUERY.gupVersion,
    isValid: (value) => value.length <= LIMITS.gupVersion.max && PATTERNS.gupVersion.test(value),
    normalize: (value) => value,
  },
  platform: {
    param: QUERY.platform,
    isValid: (value) => FEEDBACK_PLATFORMS.includes(value),
    normalize: (value) => value,
  },
});

/**
 * @param {string} search  `location.search`
 * @returns {{ installId?: string, gupVersion?: string, platform?: string }}
 *          Only the parameters that are present and valid.
 */
export function prefillFromQuery(search) {
  const params = new URLSearchParams(search);
  const prefill = {};
  for (const [field, rule] of Object.entries(RULES)) {
    const value = params.get(rule.param)?.trim() ?? "";
    if (value && rule.isValid(value)) prefill[field] = rule.normalize(value);
  }
  return prefill;
}
