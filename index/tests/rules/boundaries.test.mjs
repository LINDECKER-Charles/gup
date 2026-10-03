/**
 * The client bundle never carries a catalog or a build module: nothing under
 * src/ may import from build/ or src/i18n/catalogs/. (The verify suite also
 * greps the built JavaScript for catalog sentinels; this catches the import
 * before a build is even run.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "src");
const FORBIDDEN = [join(ROOT, "build") + sep, join(SRC, "i18n", "catalogs") + sep];
const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

const sources = readdirSync(SRC, { recursive: true })
  .filter((entry) => /\.(js|jsx)$/.test(entry))
  .map((entry) => join(SRC, entry))
  .filter((file) => !file.startsWith(FORBIDDEN[1]));

test("there are client sources to check", () => {
  assert.ok(sources.length > 20, `${sources.length} files`);
});

test("no client module imports a build module or a catalog", () => {
  const offences = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(SPECIFIER)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => specifier.startsWith("."))
      .filter((specifier) => {
        const target = resolve(dirname(file), specifier);
        return FORBIDDEN.some((prefix) => target.startsWith(prefix));
      })
      .map((specifier) => `${relative(ROOT, file)} → ${specifier}`),
  );
  assert.deepEqual(offences, []);
});
