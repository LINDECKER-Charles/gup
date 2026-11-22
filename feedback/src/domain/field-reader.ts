import { isPlainText } from "../security/is-plain-text.js";
import { FIELD_RULES } from "./field-rules.js";

/** `2026-11-20T08:00:00.000000000+01:00` and a little slack. */
const MAX_TIMESTAMP_LENGTH = 40;

export interface TextRule {
  readonly min?: number;
  readonly max: number;
  readonly pattern?: RegExp;
}

function isWithinRule(text: string, rule: TextRule): boolean {
  const isTooShort = rule.min !== undefined && text.length < rule.min;
  const isOffPattern = rule.pattern !== undefined && !rule.pattern.test(text);
  return !isTooShort && text.length <= rule.max && !isOffPattern;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Reads typed fields out of an untrusted object and records the names of the
 * invalid ones. A read that fails returns a placeholder: the caller checks
 * `invalidFields` once, after reading everything, and discards the values when
 * it is not empty — that way one response lists every faulty field.
 */
export class FieldReader {
  readonly #source: Readonly<Record<string, unknown>>;
  readonly #prefix: string;
  readonly #invalid: string[];

  constructor(source: unknown, scope: { prefix?: string; sink?: string[] } = {}) {
    this.#source = asRecord(source);
    this.#prefix = scope.prefix ?? "";
    this.#invalid = scope.sink ?? [];
  }

  get invalidFields(): readonly string[] {
    return this.#invalid;
  }

  /** A string, trimmed, within the rule's bounds. */
  requiredText(name: string, rule: TextRule): string {
    const text = this.optionalText(name, rule);
    if (text === null) this.#markInvalid(name);
    return text ?? "";
  }

  /**
   * Like `requiredText`, but an absent value or an empty string reads as `null`.
   * Control characters other than tab and line breaks make the field invalid.
   */
  optionalText(name: string, rule: TextRule): string | null {
    const raw = this.#source[name];
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "string" || !isPlainText(raw)) return this.#reject(name);
    const text = raw.trim();
    if (text === "") return null;
    return isWithinRule(text, rule) ? text : this.#reject(name);
  }

  /** One of `choices`; the first choice as placeholder when invalid. */
  requiredChoice<T extends string>(name: string, choices: readonly [T, ...T[]]): T {
    const choice = this.optionalChoice(name, choices);
    if (choice === null) this.#markInvalid(name);
    return choice ?? choices[0];
  }

  optionalChoice<T extends string>(name: string, choices: readonly T[]): T | null {
    const raw = this.#source[name];
    if (raw === undefined || raw === null || raw === "") return null;
    const choice = choices.find((candidate) => candidate === raw);
    return choice ?? this.#reject(name);
  }

  /** An ISO-8601 instant with an explicit offset, that also parses to a real date. */
  requiredTimestamp(name: string): Date {
    const rule = { max: MAX_TIMESTAMP_LENGTH, pattern: FIELD_RULES.isoTimestamp };
    const raw = this.requiredText(name, rule);
    const instant = new Date(raw);
    if (raw !== "" && Number.isNaN(instant.getTime())) this.#markInvalid(name);
    return instant;
  }

  /** A JSON integer (not a numeric string). */
  requiredInteger(name: string): number {
    const raw = this.#source[name];
    if (Number.isSafeInteger(raw)) return raw as number;
    this.#markInvalid(name);
    return 0;
  }

  #reject(name: string): null {
    this.#markInvalid(name);
    return null;
  }

  #markInvalid(name: string): void {
    const qualified = `${this.#prefix}${name}`;
    if (!this.#invalid.includes(qualified)) this.#invalid.push(qualified);
  }
}
