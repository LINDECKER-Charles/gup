/** Every stylesheet under src/styles/, as `{ file, text }` with a repo-relative path. */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const STYLES = join(ROOT, "src", "styles");

export function readStylesheets() {
  return readdirSync(STYLES, { recursive: true })
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => join(STYLES, entry))
    .map((file) => ({ file: relative(ROOT, file), text: readFileSync(file, "utf8") }));
}
