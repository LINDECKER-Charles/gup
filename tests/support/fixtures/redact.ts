import { homedir, hostname, userInfo } from "node:os";

/**
 * Redaction and secret scan for recorded tool output. The repository is
 * public: a fixture recorded on a developer machine must carry neither the
 * user's identity nor a credential. Shared by the fixture recorder and its
 * self-test, so what the test proves is what the recorder runs.
 */

/** Identity of the machine the output was recorded on. */
export interface RedactionContext {
  readonly user: string;
  readonly host: string;
  readonly home: string;
  /** Windows paths and account names are case-insensitive. */
  readonly isCaseInsensitive: boolean;
}

export type Placeholder = "<HOME>" | "<USER>" | "<HOST>";

export interface Redaction {
  readonly text: string;
  readonly counts: Readonly<Record<Placeholder, number>>;
}

export interface SecretHit {
  readonly kind: string;
  /** Offset of the match in the scanned text. */
  readonly index: number;
}

/** The identity of the machine running this process. */
export function hostRedactionContext(): RedactionContext {
  return {
    user: userInfo().username,
    host: hostname(),
    home: homedir(),
    isCaseInsensitive: process.platform === "win32",
  };
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A name only counts as the user or the host when it stands alone: "u" must
// not eat every "u" of the output, nor "dev" the start of "devDependencies".
const TOKEN_EDGE_BEFORE = "(?<![A-Za-z0-9_.-])";
const TOKEN_EDGE_AFTER = "(?![A-Za-z0-9_-])";

function replaceAll(
  text: string,
  pattern: RegExp,
  placeholder: Placeholder,
): { readonly text: string; readonly count: number } {
  let count = 0;
  const replaced = text.replace(pattern, () => {
    count += 1;
    return placeholder;
  });
  return { text: replaced, count };
}

function homePattern(context: RedactionContext): RegExp | null {
  if (context.home.length === 0) return null;
  // Both separator styles: Windows tools print `C:\Users\u` and `C:/Users/u`;
  // a JSON report (npm, pip) escapes the backslashes: `C:\\Users\\u`.
  const variants = new Set([
    context.home,
    context.home.replaceAll("\\", "/"),
    context.home.replaceAll("\\", "\\\\"),
  ]);
  const alternatives = [...variants].map(escapeRegExp).join("|");
  // Not the prefix of a longer name: `C:\Users\u` must leave `C:\Users\uv` alone.
  const body = `(?:${alternatives})${TOKEN_EDGE_AFTER}`;
  return new RegExp(body, context.isCaseInsensitive ? "gi" : "g");
}

function tokenPattern(name: string, isCaseInsensitive: boolean): RegExp | null {
  if (name.length === 0) return null;
  const body = `${TOKEN_EDGE_BEFORE}${escapeRegExp(name)}${TOKEN_EDGE_AFTER}`;
  return new RegExp(body, isCaseInsensitive ? "gi" : "g");
}

/**
 * Replace the home directory, then the user name, then the host name. Home
 * first: it contains the user name, and `<HOME>` says more than
 * `C:\Users\<USER>`. Host names are case-insensitive on every platform.
 */
export function redact(text: string, context: RedactionContext): Redaction {
  const steps: readonly (readonly [Placeholder, RegExp | null])[] = [
    ["<HOME>", homePattern(context)],
    ["<USER>", tokenPattern(context.user, context.isCaseInsensitive)],
    ["<HOST>", tokenPattern(context.host, true)],
  ];
  const counts: Record<Placeholder, number> = { "<HOME>": 0, "<USER>": 0, "<HOST>": 0 };
  let current = text;
  for (const [placeholder, pattern] of steps) {
    if (!pattern) continue;
    const step = replaceAll(current, pattern, placeholder);
    current = step.text;
    counts[placeholder] = step.count;
  }
  return { text: current, counts };
}

const SECRET_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["github token", /\bgh[pousr]_[A-Za-z0-9]{36,}/g],
  ["github fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{22,}/g],
  ["aws access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["slack token", /\bxox[bp]-[A-Za-z0-9-]+/g],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/g],
  ["e-mail address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
];

/** Every credential-looking match. A non-empty result must abort the write. */
export function findSecrets(text: string): readonly SecretHit[] {
  const hits: SecretHit[] = [];
  for (const [kind, pattern] of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern)) hits.push({ kind, index: match.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}
