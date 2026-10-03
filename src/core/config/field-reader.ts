/**
 * Lenient, typed access to one object of the settings file. A field that is
 * absent takes its fallback silently; a field that is present but wrong takes
 * its fallback and records an issue (French: the issues are shown to the
 * user), so one hand-edited mistake never drops a whole section.
 *
 * Only own keys are read and the prototype-polluting names are never
 * returned, whatever the file contains.
 */

export interface IntegerBounds {
  readonly min: number;
  readonly max: number;
}

export interface IdListBounds {
  readonly max: number;
  readonly pattern: RegExp;
}

export type HexColor = `#${string}`;

export interface FieldReader {
  boolean(key: string, fallback: boolean): boolean;
  oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T;
  integer(key: string, bounds: IntegerBounds, fallback: number): number;
  /** Optional colour: `#rgb` / `#rrggbb` normalised to upper-case `#RRGGBB`, else undefined. */
  hexColor(key: string): HexColor | undefined;
  /** De-duplicated list of pattern-checked strings, truncated to `bounds.max`. */
  ids(key: string, bounds: IdListBounds): readonly string[];
  /** Nested object reader; a missing or invalid value gives an empty reader. */
  object(key: string): FieldReader;
  /** Own keys, minus `__proto__`, `constructor`, `prototype`. */
  keys(): readonly string[];
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#[0-9a-f]{6}$/i;

/** True for a plain JSON object (not null, not an array). */
export function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** False for the keys that could reach an object's prototype; they are never copied. */
export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key);
}

/** Read `raw` (any JSON value) as the object at `path`, recording problems in `issues`. */
export function createFieldReader(raw: unknown, path: string, issues: string[]): FieldReader {
  return new LenientFieldReader(isJsonObject(raw) ? raw : {}, path, issues);
}

class LenientFieldReader implements FieldReader {
  readonly #source: Readonly<Record<string, unknown>>;
  readonly #path: string;
  readonly #issues: string[];

  constructor(source: Readonly<Record<string, unknown>>, path: string, issues: string[]) {
    this.#source = source;
    this.#path = path;
    this.#issues = issues;
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.#value(key);
    if (value === undefined || typeof value === "boolean") return value ?? fallback;
    return this.#invalid(key, "booléen attendu", fallback);
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.#value(key);
    if (value === undefined) return fallback;
    const match = allowed.find((candidate) => candidate === value);
    if (match !== undefined) return match;
    return this.#invalid(key, `une valeur parmi ${allowed.join(", ")} attendue`, fallback);
  }

  integer(key: string, bounds: IntegerBounds, fallback: number): number {
    const value = this.#value(key);
    if (value === undefined) return fallback;
    const isInRange =
      Number.isInteger(value) && (value as number) >= bounds.min && (value as number) <= bounds.max;
    if (isInRange) return value as number;
    return this.#invalid(key, `entier entre ${bounds.min} et ${bounds.max} attendu`, fallback);
  }

  hexColor(key: string): HexColor | undefined {
    const value = this.#value(key);
    if (value === undefined) return undefined;
    const normalized = typeof value === "string" ? normalizeHex(value) : undefined;
    if (normalized) return normalized;
    return this.#invalid(key, "couleur #RRGGBB attendue", undefined);
  }

  ids(key: string, bounds: IdListBounds): readonly string[] {
    const value = this.#value(key);
    if (value === undefined) return [];
    if (!Array.isArray(value)) return this.#invalid(key, "liste attendue", []);
    const valid = value.filter(
      (item): item is string => typeof item === "string" && bounds.pattern.test(item),
    );
    if (valid.length !== value.length) this.#report(key, "identifiants invalides ignorés");
    return [...new Set(valid)].slice(0, bounds.max);
  }

  object(key: string): FieldReader {
    const value = this.#value(key);
    if (value !== undefined && !isJsonObject(value)) this.#report(key, "objet attendu");
    return createFieldReader(value, `${this.#path}.${key}`, this.#issues);
  }

  keys(): readonly string[] {
    return Object.keys(this.#source).filter(isSafeKey);
  }

  #value(key: string): unknown {
    if (!isSafeKey(key) || !Object.hasOwn(this.#source, key)) return undefined;
    return this.#source[key];
  }

  #invalid<T>(key: string, expected: string, fallback: T): T {
    this.#report(key, expected);
    return fallback;
  }

  #report(key: string, problem: string): void {
    this.#issues.push(`${this.#path}.${key} : ${problem}`);
  }
}

function normalizeHex(value: string): HexColor | undefined {
  const short = SHORT_HEX.exec(value);
  if (short) {
    const [, red, green, blue] = short;
    return `#${red}${red}${green}${green}${blue}${blue}`.toUpperCase() as HexColor;
  }
  return LONG_HEX.test(value) ? (value.toUpperCase() as HexColor) : undefined;
}
