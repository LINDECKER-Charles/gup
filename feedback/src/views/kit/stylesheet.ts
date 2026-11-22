import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SOURCE = new URL("../../../assets/app.css", import.meta.url);
const VERSION_LENGTH = 12;

const css = readFileSync(SOURCE, "utf8");
const version = createHash("sha256").update(css).digest("hex").slice(0, VERSION_LENGTH);

/**
 * The back office's only stylesheet, read once at start-up. Its URL carries a
 * content hash, so it can be cached forever and still change on deploy.
 * The path resolves the same from src/ (tsx, vitest) and dist/ (tsc keeps the depth).
 */
export const STYLESHEET = {
  css,
  version,
  href: `/admin/assets/app.css?v=${version}`,
} as const;
