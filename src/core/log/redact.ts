import { homedir } from "node:os";

/**
 * What the debug log, the history and the diagnostic archive strip before
 * writing: secrets that tools print or that sit in a command line, and — for
 * the log and the exports — the user's home directory, shortened to `~`
 * (it names the account).
 *
 * Patterns target known secret *shapes* only, so a package called
 * `token-bucket`, a `--token-file <path>` flag or a version string survive.
 * Every pattern starts at a literal prefix, or only where a run of its own
 * class starts (lookbehind), and uses single, bounded quantifiers. Each
 * character is therefore examined a bounded number of times: redacting a
 * megabyte of hostile text stays linear (a test holds the line). Value classes
 * exclude `"` and `\`, so redacting JSON text keeps it valid JSON.
 */

export const REDACTED = "***";

type Rule = readonly [pattern: RegExp, replacement: string];

/**
 * How a name whose assigned value is a secret ends: `password`, `NPM_TOKEN`,
 * `_authToken`, `_auth`, `AWS_SECRET_ACCESS_KEY`, `AccountKey`, `client_secret`.
 */
const SECRET_NAME_ENDS = [
  "passw(?:or)?d",
  "passphrase",
  "pwd",
  "secret",
  "token",
  "auth",
  "(?:api|access|account|private|secret)[_-]?key",
].join("|");

/** A name ending like a secret's; its prefix is bounded and lazy. */
const SECRET_NAME = String.raw`[\w.-]{0,64}?(?:${SECRET_NAME_ENDS})`;

/**
 * A secret in a URL query: `?token=…`, `&client_secret=…`, `&sig=…` (an Azure
 * SAS signature), `&key=…`. The value ends at the next parameter.
 */
// eslint-disable-next-line security/detect-non-literal-regexp -- built from constants only
const QUERY_SECRET = new RegExp(
  String.raw`([?&](?:${SECRET_NAME}|sig(?:nature)?|key)=)[^&\s#"\\]{1,2048}`,
  "gi",
);

/**
 * `name=value`, `name: value`, `"name": "value"` whose name ends like a
 * secret's. The match starts only where a name run starts (a query parameter
 * is the rule above's), so a run costs at most its bounded prefix times the endings.
 */
// eslint-disable-next-line security/detect-non-literal-regexp -- built from constants only
const ASSIGNMENT = new RegExp(
  [
    String.raw`(?<![\w.?&-])(${SECRET_NAME})`,
    String.raw`("?\s{0,3}[=:]\s{0,3}["']?)`,
    String.raw`[^\s"',;\\]{1,512}`,
  ].join(""),
  "gi",
);

const SECRET_RULES: readonly Rule[] = [
  // scheme://user:password@host — the credentials go, the host stays. The user may be
  // empty (`https://:PAT@dev.azure.com`), the password may hold an `@` (the last one ends it).
  [
    /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@:"\\]{0,256}:[^\s/"\\]{1,256}@/gi,
    "$1***@",
  ],
  [QUERY_SECRET, "$1***"],
  // An (Proxy-)Authorization header, whatever its scheme (Bearer, token, Digest…): the
  // scheme stays.
  [
    /(?<!\w)(authorization"?\s{0,3}:\s{0,3}"?(?:[a-z]{1,32}\s{1,8})?)[^\s"\\]{1,2048}/gi,
    "$1***",
  ],
  // Bearer/Basic credentials elsewhere — not a plain lowercase word ("Basic configuration").
  [
    /\b(Bearer|Basic)\s{1,8}(?=[a-z]{0,2048}[A-Z0-9._~+/=-])[A-Za-z0-9._~+/=-]{8,2048}/g,
    "$1 ***",
  ],
  [ASSIGNMENT, "$1$2***"],
  // Token formats: GitHub, npm, GitLab, Slack, PyPI, NuGet, AWS access keys (long-lived and
  // session), Google API keys, JWTs.
  [/(?<![\w])(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})/g, REDACTED],
  [/(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g, REDACTED],
  [/(?<![A-Za-z0-9_-])glpat-[A-Za-z0-9_-]{20,64}/g, REDACTED],
  [/(?<![A-Za-z0-9_-])xox[abprs]-[A-Za-z0-9-]{10,255}/g, REDACTED],
  [/(?<![A-Za-z0-9_-])pypi-AgE[A-Za-z0-9_-]{32,4096}/g, REDACTED],
  [/(?<![A-Za-z0-9])oy2[a-z0-9]{43}(?![A-Za-z0-9])/g, REDACTED],
  [/(?<![A-Za-z0-9])A(?:KI|SI)A[0-9A-Z]{16}(?![A-Za-z0-9])/g, REDACTED],
  [/(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [
    /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}/g,
    REDACTED,
  ],
];

const PEM_BEGIN = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/g;
const PEM_END = /-----END [A-Z ]{0,40}PRIVATE KEY-----/g;
const PEM_MARKER = "PRIVATE KEY-----";
const PEM_REPLACEMENT = "-----PRIVATE KEY ***-----";

/**
 * Names whose value is a secret, compared without case, dashes nor
 * underscores: a flag (`--api-key x`), a log data key (`authorization`).
 */
const SECRET_NAMES: ReadonlySet<string> = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "accesstoken",
  "apikey",
  "accesskey",
  "clientsecret",
  "privatekey",
  "auth",
  "authorization",
  "cookie",
  "otp",
  "pat",
]);
const NAME_SEPARATORS = /[-_]/g;

/** `--name`, `-name`, `--name=value`, `--name:value`. */
const FLAG = /^(--?)([A-Za-z][\w-]{0,63})(?:([=:])([\s\S]*))?$/;

/** Known secret shapes only — safe for history messages, which keep their paths verbatim. */
export function redactSecrets(text: string): string {
  let out = redactPrivateKeys(text);
  for (const [pattern, replacement] of SECRET_RULES) out = out.replace(pattern, replacement);
  return out;
}

/** {@link redactSecrets}, then the home directory shortened to `~`. */
export function redactText(text: string): string {
  return withHomeShortened(redactSecrets(text));
}

/** `text` with this process's home directory shortened to `~`: a path as the screen shows it. */
export function withHomeShortened(text: string): string {
  return shortenHome(text, homeDirectory(), process.platform);
}

/**
 * Every occurrence of `home` in `text` replaced by `~`. On Windows the match
 * ignores case and accepts both separators, single or JSON-escaped; it never
 * cuts a longer name (`C:\Users\danae` survives a home of `C:\Users\dana`).
 */
export function shortenHome(text: string, home: string, platform: NodeJS.Platform): string {
  const pattern = homePattern(home, platform);
  return pattern ? text.replace(pattern, "~") : text;
}

/** Whether a value named `name` is a secret (`api_key`, `Authorization`, `client-secret`). */
export function isSecretName(name: string): boolean {
  return SECRET_NAMES.has(name.toLowerCase().replace(NAME_SEPARATORS, ""));
}

/**
 * Argv with the values of secret flags replaced — the next argument of
 * `--token`, the attached part of `--password=x` — and every other argument
 * through {@link redactText}. `--token-file <path>` is not a secret flag.
 */
export function redactArgv(args: readonly string[]): string[] {
  const out: string[] = [];
  let isSecretNext = false;
  for (const arg of args) {
    if (isSecretNext) {
      out.push(REDACTED);
      isSecretNext = false;
      continue;
    }
    const flag = FLAG.exec(arg);
    if (!flag?.[2] || !isSecretName(flag[2])) {
      out.push(redactText(arg));
      continue;
    }
    isSecretNext = flag[3] === undefined;
    out.push(isSecretNext ? arg : `${flag[1]}${flag[2]}${flag[3]}${REDACTED}`);
  }
  return out;
}

/** The first `max` characters, then how many were cut: `abc… (+12)`. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (+${text.length - max})`;
}

/** What {@link redactedTail} puts before the characters it keeps. */
export const TAIL_MARKER = "(…) ";

/**
 * How much of a runaway text is redacted around the part kept: the work stays
 * bounded, and a secret cut at the window's edge is a megabyte away from what
 * is kept.
 */
const REDACTION_WINDOW = 1024 * 1024;

/** The start of `text`, redacted before it is cut so a cut never hides half a secret. */
export function redactedHead(text: string, max: number): string {
  return clip(redactText(text.slice(0, REDACTION_WINDOW)), max);
}

/** The end of `text`, redacted before it is cut, marked as cut: `(…) xyz`. */
export function redactedTail(text: string, max: number): string {
  const redacted = redactText(text.slice(-REDACTION_WINDOW));
  if (redacted.length <= max) return redacted;
  return `${TAIL_MARKER}${redacted.slice(redacted.length - max)}`;
}

/**
 * PEM private keys, from their header to their footer — or to the end of the
 * text when the footer is missing (a truncated key is still a key). Two
 * forward-only searches, so each character is scanned at most twice.
 */
function redactPrivateKeys(text: string): string {
  if (!text.includes(PEM_MARKER)) return text;
  let out = "";
  let from = 0;
  PEM_BEGIN.lastIndex = 0;
  for (let begin = PEM_BEGIN.exec(text); begin; begin = PEM_BEGIN.exec(text)) {
    PEM_END.lastIndex = PEM_BEGIN.lastIndex;
    const end = PEM_END.exec(text);
    out += `${text.slice(from, begin.index)}${PEM_REPLACEMENT}`;
    from = end ? PEM_END.lastIndex : text.length;
    PEM_BEGIN.lastIndex = from;
  }
  return `${out}${text.slice(from)}`;
}

function homeDirectory(): string {
  try {
    return homedir();
  } catch {
    return "";
  }
}

/** A home shorter than this (`/`, `C:`) would shorten every path: left alone. */
const MIN_HOME_LENGTH = 3;
const REGEXP_SYNTAX = /[.*+?^${}()|[\]\\/]/g;

/** The last home pattern built: every string of every record goes through it. */
let cachedPattern: { readonly key: string; readonly pattern: RegExp | null } | null = null;

function homePattern(home: string, platform: NodeJS.Platform): RegExp | null {
  const key = `${platform}\u0000${home}`;
  if (cachedPattern?.key !== key) {
    cachedPattern = { key, pattern: buildHomePattern(home, platform) };
  }
  return cachedPattern.pattern;
}

function buildHomePattern(home: string, platform: NodeJS.Platform): RegExp | null {
  const isWindows = platform === "win32";
  const segments = home.split(isWindows ? /[\\/]/ : "/");
  while (segments.length > 1 && segments.at(-1) === "") segments.pop();
  const trimmed = segments.join("/");
  if (trimmed.length < MIN_HOME_LENGTH) return null;
  const separator = isWindows ? "[\\\\/]{1,2}" : "/";
  const body = segments.map((segment) => segment.replace(REGEXP_SYNTAX, "\\$&")).join(separator);
  // Built from the user's own home directory, every segment escaped; the
  // lookahead stops `~` from eating the start of a longer directory name.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`${body}(?![\\p{L}\\p{N}_-])`, isWindows ? "giu" : "gu");
}
