import { createRequire } from "node:module";

const PACKAGE_NAME = "@charles_lindecker/gup";

/**
 * Candidate locations of package.json relative to the importing module.
 *
 * Two entries because the module graph is flat at runtime but nested in
 * development: tsup bundles everything into `dist/cli.js`, one level below the
 * package root, while `npm run dev` runs this file from `src/core/`, two
 * levels below. Each candidate is validated by name so a stray package.json
 * belonging to a parent directory can never be picked up.
 */
const CANDIDATES = ["../package.json", "../../package.json"] as const;

let cached: string | null = null;

/**
 * The running package version, read from package.json instead of restated in
 * source.
 *
 * It used to be declared twice — `src/cli.ts` and the menu header — and both
 * copies had drifted to 0.1.0 while the package shipped as 0.2.2. `gup
 * --version` therefore lied, and so did every bug report quoting it. One
 * reader, one source of truth, no literal to forget on the next release.
 */
export function gupVersion(): string {
  if (cached !== null) return cached;
  const require = createRequire(import.meta.url);
  for (const candidate of CANDIDATES) {
    try {
      // `candidate` comes from the frozen CANDIDATES literal above, never from
      // input, and the resolved module is validated by name before its version
      // is trusted. No attacker-controlled value can reach this require.
      // eslint-disable-next-line security/detect-non-literal-require -- see above
      const pkg = require(candidate) as { name?: string; version?: string };
      if (pkg.name === PACKAGE_NAME && pkg.version) {
        cached = pkg.version;
        return cached;
      }
    } catch {
      /* try the next candidate */
    }
  }
  // Never throw over a cosmetic string: a missing package.json must not stop
  // the CLI from running.
  cached = "0.0.0";
  return cached;
}
