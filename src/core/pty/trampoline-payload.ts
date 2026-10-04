import { LOCALES, type Locale } from "../i18n/locale.js";
import type { InheritRequest } from "../process/inherit-sink.js";

/**
 * The single argument node-pty passes to the trampoline (`pty-exec`): the
 * install request, as `base64url(JSON)`. Only `[A-Za-z0-9_-]` ever reaches
 * the pseudo-terminal's command line, so no quoting layer — ConPTY's
 * `CreateProcessW` command line, a POSIX argv — can split or reinterpret a
 * package id. The trampoline validates everything before running it, and the
 * runner sanitises the command and argv again on its side.
 */

/** Data format version; a trampoline refuses any other. */
export const PAYLOAD_VERSION = 1;

/**
 * Headroom under Windows' 32 767-character command line, which also carries
 * node's path, its loader flags and the trampoline's path. The 8 191-character
 * limit of `cmd.exe` still applies to `.cmd` targets, as without a PTY.
 */
export const MAX_PAYLOAD_CHARS = 24_000;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "v",
  "command",
  "args",
  "cwd",
  "shell",
  "exitFile",
  "locale",
]);

export interface TrampolinePayload extends InheritRequest {
  readonly v: typeof PAYLOAD_VERSION;
  /** Where the trampoline writes the exit code before exiting (Windows fast path). */
  readonly exitFile?: string;
  /**
   * The parent's language: the trampoline runs in a process of its own, where
   * nothing else chooses one, and speaks it in what it prints.
   */
  readonly locale?: Locale;
}

/** Throws when the encoded request would not fit on the command line. */
export function encodePayload(payload: TrampolinePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  if (encoded.length > MAX_PAYLOAD_CHARS) {
    throw new RangeError(
      `pty payload: ${encoded.length} characters, over the ${MAX_PAYLOAD_CHARS} limit`,
    );
  }
  return encoded;
}

/** Throws on anything but a well-formed version-1 payload. */
export function decodePayload(encoded: string): TrampolinePayload {
  if (encoded.length === 0 || encoded.length > MAX_PAYLOAD_CHARS || !BASE64URL.test(encoded)) {
    throw new Error("pty payload: not a base64url string of an accepted length");
  }
  const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  return payloadOf(value);
}

/**
 * Rebuild the payload from validated fields only: an unknown key, a wrong
 * type or another version is refused, never ignored.
 */
function payloadOf(value: unknown): TrampolinePayload {
  const record = versionOneRecord(value);
  const { command, args } = record;
  if (typeof command !== "string" || command.length === 0) return refuse("command");
  if (!isStringArray(args)) return refuse("args");
  const cwd = optionalField(record, "cwd", "string");
  const shell = optionalField(record, "shell", "boolean");
  const exitFile = optionalField(record, "exitFile", "string");
  const locale = optionalLocale(record);
  return {
    v: PAYLOAD_VERSION,
    command,
    args: [...args],
    ...(cwd !== undefined && { cwd: cwd as string }),
    ...(shell !== undefined && { shell: shell as boolean }),
    ...(exitFile !== undefined && { exitFile: exitFile as string }),
    ...(locale !== undefined && { locale }),
  };
}

/** One of the languages gup speaks, written exactly as the parent writes it; absent is allowed. */
function optionalLocale(record: Record<string, unknown>): Locale | undefined {
  const value = optionalField(record, "locale", "string");
  if (value === undefined) return undefined;
  return LOCALES.find((locale) => locale === value) ?? refuse("locale");
}

function versionOneRecord(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return refuse("not an object");
  const unknownKey = Object.keys(value).find((key) => !PAYLOAD_KEYS.has(key));
  if (unknownKey !== undefined) return refuse(`unknown field ${unknownKey}`);
  if (value["v"] !== PAYLOAD_VERSION) return refuse("unsupported version");
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalField(
  record: Record<string, unknown>,
  key: string,
  type: "string" | "boolean",
): unknown {
  const field = record[key];
  if (field !== undefined && typeof field !== type) refuse(key);
  return field;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuse(what: string): never {
  throw new Error(`pty payload: invalid ${what}`);
}
