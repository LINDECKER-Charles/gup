import { createHash } from "node:crypto";

/**
 * The report's Content-Security-Policy: nothing loads (no network, no font,
 * no frame), only the page's own script and stylesheet run — allowed by the
 * SHA-256 of their exact text — images only from `data:` (the favicon), and
 * Trusted Types required, so a stray string-to-HTML sink throws in the
 * browsers that enforce it instead of parsing markup.
 */

export interface CspHashes {
  /** Base64 SHA-256 of the inline script. */
  readonly script: string;
  /** Base64 SHA-256 of the inline stylesheet. */
  readonly style: string;
}

export function sha256Base64(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("base64");
}

export function contentSecurityPolicy(hashes: CspHashes): string {
  return [
    "default-src 'none'",
    `script-src 'sha256-${hashes.script}'`,
    `style-src 'sha256-${hashes.style}'`,
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join("; ");
}
