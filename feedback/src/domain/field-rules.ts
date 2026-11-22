/**
 * Every limit and pattern of the public API, in one place: the contract
 * (docs/development/feedback-service.md) changes, this file changes.
 */
export const FIELD_RULES = {
  title: { min: 3, max: 120 },
  message: { min: 10, max: 5000 },
  email: { max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  installId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  gupVersion: { max: 32, pattern: /^[0-9A-Za-z.+-]+$/ },
  locale: { max: 10, pattern: /^[a-z]{2}(-[A-Za-z]{2})?$/ },
  arch: { max: 32, pattern: /^[0-9A-Za-z._-]+$/ },
  node: { max: 32, pattern: /^[0-9A-Za-z.+-]+$/ },
  runId: { max: 64 },
  /** `<domain>.<action>`, as `isEventName` in the CLI's src/core/log/types.ts. */
  event: { max: 48, pattern: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/ },
  updateStatus: { max: 16 },
  isoTimestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/,
  /** A form filled faster than this is a bot. */
  minimumFillMs: 3000,
  batch: { maxItems: 1000, maxItemBytes: 16 * 1024, maxBodyBytes: 1024 * 1024 },
  /**
   * Body limit of a form carrying a 5000-character text: in a non-Latin
   * script, form-encoded, it takes up to 45 KiB.
   */
  longTextBodyBytes: 64 * 1024,
  /** The only batch schema this service understands. */
  batchSchema: 1,
} as const;
