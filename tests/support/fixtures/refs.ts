import { isAbsolute, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lazy references to files on disk, so that contract cases stay pure data:
 * the recorder (scripts/fixtures) imports the same cases without loading a
 * byte, and the fake system resolves the references when a test loads them.
 */

/** Recorded tool output, relative to `tests/fixtures/`. */
export interface FixtureRef {
  readonly kind: "fixture";
  readonly path: string;
}

/** Expected rows of a fixture-backed scenario, an absolute `__golden__/*.json` path. */
export interface GoldenRef {
  readonly kind: "golden";
  readonly file: string;
}

/** `tests/fixtures/`, absolute. */
const FIXTURES_ROOT = fileURLToPath(new URL("../../fixtures/", import.meta.url));

const PROVIDER_TESTS_ROOT = fileURLToPath(new URL("../../providers/", import.meta.url));

/** A name segment: letters, digits, dots, dashes and underscores, no traversal. */
const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function assertInside(relative: string, what: string): void {
  const segments = relative.split("/");
  const isSafe =
    !isAbsolute(relative) &&
    segments.every((segment) => SAFE_SEGMENT.test(segment) && segment !== "..");
  if (!isSafe) throw new Error(`${what} must be a plain relative path, got "${relative}"`);
}

/** Reference `tests/fixtures/<path>` (forward slashes). */
export function fixture(path: string): FixtureRef {
  assertInside(path, "fixture path");
  return { kind: "fixture", path };
}

/** Reference `tests/providers/<domain>/__golden__/<name>.json`. */
export function golden(domain: string, name: string): GoldenRef {
  assertInside(domain, "golden domain");
  assertInside(name, "golden name");
  return { kind: "golden", file: join(PROVIDER_TESTS_ROOT, domain, "__golden__", `${name}.json`) };
}

/** Absolute path of a fixture reference. */
export function fixtureFile(ref: FixtureRef): string {
  return join(FIXTURES_ROOT, normalize(ref.path.split("/").join(sep)));
}

export function isFixtureRef(value: unknown): value is FixtureRef {
  return typeof value === "object" && value !== null && (value as FixtureRef).kind === "fixture";
}

export function isGoldenRef(value: unknown): value is GoldenRef {
  return typeof value === "object" && value !== null && (value as GoldenRef).kind === "golden";
}
