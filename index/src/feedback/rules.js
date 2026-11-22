/**
 * The feedback form's contract with the service, once (docs/development/
 * feedback-service.md, `POST /api/feedback`): field limits, accepted shapes
 * and the query parameters the CLI links with. The form, the client-side
 * validation and the query prefill all read these — never a literal.
 */

export const FEEDBACK_KINDS = Object.freeze(["bug", "suggestion"]);
export const DEFAULT_KIND = FEEDBACK_KINDS[0];

export const FEEDBACK_PLATFORMS = Object.freeze(["win32", "darwin", "linux", "other"]);

/** Inclusive bounds, in characters, applied after trimming. */
export const LIMITS = Object.freeze({
  title: Object.freeze({ min: 3, max: 120 }),
  message: Object.freeze({ min: 10, max: 5000 }),
  email: Object.freeze({ max: 254 }),
  installId: Object.freeze({ max: 36 }),
  gupVersion: Object.freeze({ max: 32 }),
});

export const PATTERNS = Object.freeze({
  installId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  gupVersion: /^[0-9A-Za-z.+-]+$/,
  /** "Plausible", like the service: something@something.tld, no whitespace. */
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
});

/** What the page reads from the URL: the CLI links with `?install=&version=&platform=`. */
export const QUERY = Object.freeze({
  installId: "install",
  gupVersion: "version",
  platform: "platform",
  status: "feedback",
});

/** The `feedback=` values the service appends when it redirects a plain form post. */
export const STATUSES = Object.freeze(["sent", "invalid", "limited"]);

export const FEEDBACK_PATH = "/api/feedback";
export const REQUEST_TIMEOUT_MS = 15_000;
