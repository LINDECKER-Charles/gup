const TRUE_VALUES = ["true", "1", "yes"];
const FALSE_VALUES = ["false", "0", "no"];
const WEB_PROTOCOLS = ["http:", "https:"];

interface IntegerRule {
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
}

function parseWebUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return WEB_PROTOCOLS.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Reads typed settings out of the environment and collects every problem
 * instead of stopping at the first: a misconfigured deployment gets the full
 * list in one failed start.
 */
export class EnvReader {
  readonly #env: Readonly<Record<string, string | undefined>>;
  readonly #errors: string[] = [];

  constructor(env: Readonly<Record<string, string | undefined>>) {
    this.#env = env;
  }

  get errors(): readonly string[] {
    return this.#errors;
  }

  /** Trimmed value; an empty one counts as unset. */
  optional(name: string): string | null {
    const value = this.#env[name]?.trim();
    return value === undefined || value === "" ? null : value;
  }

  required(name: string): string {
    const value = this.optional(name);
    if (value === null) this.reject(name, "is required");
    return value ?? "";
  }

  integer(name: string, rule: IntegerRule): number {
    const raw = this.optional(name);
    if (raw === null) return rule.fallback;
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value >= rule.min && value <= rule.max) return value;
    this.reject(name, `must be an integer between ${rule.min} and ${rule.max}`);
    return rule.fallback;
  }

  boolean(name: string, fallback: boolean): boolean {
    const raw = this.optional(name)?.toLowerCase();
    if (raw === undefined) return fallback;
    if (TRUE_VALUES.includes(raw)) return true;
    if (FALSE_VALUES.includes(raw)) return false;
    this.reject(name, "must be true or false");
    return fallback;
  }

  /** An absolute http(s) URL; returns the parsed URL, or null when invalid. */
  webUrl(name: string, fallback?: string): URL | null {
    const raw = this.optional(name) ?? fallback;
    if (raw === undefined) {
      this.reject(name, "is required");
      return null;
    }
    const url = parseWebUrl(raw);
    if (url === null) this.reject(name, "must be an absolute http(s) URL");
    return url;
  }

  /** A comma-separated list of http(s) origins. */
  origins(name: string, fallback: readonly string[]): string[] {
    const raw = this.optional(name);
    if (raw === null) return [...fallback];
    const entries = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
    const urls = entries.map(parseWebUrl);
    if (urls.some((url, index) => url === null || url.origin !== entries[index])) {
      this.reject(name, "must list origins such as https://example.com, comma-separated");
    }
    return entries;
  }

  reject(name: string, problem: string): void {
    this.#errors.push(`${name} ${problem}`);
  }
}
