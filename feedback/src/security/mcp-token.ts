import { randomToken } from "./random-token.js";

/** Says what the secret is to whoever finds it, and lets secret scanners match it. */
const PREFIX = "gupmcp_";
/** The prefix, then 32 random bytes in base64url. */
const TOKEN_PATTERN = /^gupmcp_[A-Za-z0-9_-]{43}$/;
const HINT_LENGTH = 4;

export const MCP_TOKEN = {
  create: (): string => `${PREFIX}${randomToken()}`,
  /** Whether a value has the shape of a token: anything else is refused before any lookup. */
  isWellFormed: (value: string): boolean => TOKEN_PATTERN.test(value),
  /** Its last characters, shown to tell tokens apart. */
  hint: (token: string): string => token.slice(-HINT_LENGTH),
  /** How a hint is shown: `gupmcp_…a1B2`. */
  masked: (hint: string): string => `${PREFIX}…${hint}`,
} as const;
