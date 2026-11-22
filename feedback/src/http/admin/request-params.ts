/**
 * Lenient reads of query strings, route params and form bodies: back-office
 * inputs come from its own links and forms, so a value that does not parse
 * falls back to null (the caller picks the default or answers 404).
 */
export class RequestParams {
  readonly #source: Readonly<Record<string, unknown>>;

  constructor(source: unknown) {
    this.#source = typeof source === "object" && source !== null
      ? (source as Record<string, unknown>)
      : {};
  }

  text(name: string): string | null {
    const value = this.#source[name];
    return typeof value === "string" ? value : null;
  }

  choice<T extends string>(name: string, choices: readonly T[]): T | null {
    const value = this.text(name);
    return choices.find((choice) => choice === value) ?? null;
  }

  /** A strictly positive integer written in decimal. */
  positiveInteger(name: string): number | null {
    const value = this.text(name);
    if (value === null || !/^[1-9]\d{0,15}$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  /** The `page` query parameter, 1 when absent or malformed. */
  page(): number {
    return this.positiveInteger("page") ?? 1;
  }
}
