/**
 * The service's field rules, applied before sending so the reader gets an
 * error next to the field instead of a round trip. The service stays the
 * authority: it re-validates and answers `fields` for anything it refuses.
 */
import { FEEDBACK_KINDS, LIMITS, PATTERNS } from "./rules.js";

const isBetween = (text, { min = 0, max }) => text.length >= min && text.length <= max;
const isOptionally = (text, isAccepted) => text === "" || isAccepted(text);

const CHECKS = Object.freeze({
  kind: ({ kind }) => FEEDBACK_KINDS.includes(kind),
  title: ({ title }) => isBetween(title.trim(), LIMITS.title),
  message: ({ message }) => isBetween(message.trim(), LIMITS.message),
  email: ({ email }) =>
    isOptionally(email.trim(), (text) => isBetween(text, LIMITS.email) && PATTERNS.email.test(text)),
  installId: ({ installId }) =>
    isOptionally(installId.trim(), (text) => PATTERNS.installId.test(text)),
});

/**
 * @param {{ kind: string, title: string, message: string, email: string, installId: string }} values
 * @returns {string[]}  Names of the invalid fields, in form order; empty when valid.
 */
export function validateFeedback(values) {
  return Object.keys(CHECKS).filter((field) => !CHECKS[field](values));
}
