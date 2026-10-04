/**
 * The string and template literals of a TypeScript source, with comments and
 * regular expressions skipped: just enough lexing to read what a CLI file
 * writes on screen without the TypeScript compiler (the site's tests run on
 * the site's own dependencies, in CI too).
 *
 * @typedef {{ kind: "string", text: string }} StringLiteral
 * @typedef {{ kind: "template", parts: string[] }} TemplateLiteral
 *   `parts` are the static texts; one interpolation sits between two parts.
 * @typedef {StringLiteral | TemplateLiteral} Literal
 */

const SIMPLE_ESCAPES = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };
/** After one of these, a `/` opens a regular expression rather than dividing. */
const REGEX_PREFIXES = new Set([..."(,=:[!&|?{};+-*%<>~^"]);

/** The character an escape sequence at `at` stands for, and where the source resumes. */
function unescape(source, at) {
  const kind = source[at + 1];
  const codePoint = (from, to) => String.fromCodePoint(parseInt(source.slice(from, to), 16));
  if (kind === "u" && source[at + 2] === "{") {
    const end = source.indexOf("}", at);
    return { text: codePoint(at + 3, end), next: end + 1 };
  }
  if (kind === "u") return { text: codePoint(at + 2, at + 6), next: at + 6 };
  if (kind === "x") return { text: codePoint(at + 2, at + 4), next: at + 4 };
  if (kind === "\n") return { text: "", next: at + 2 };
  return { text: SIMPLE_ESCAPES[kind] ?? kind, next: at + 2 };
}

class Lexer {
  /** @type {Literal[]} */
  literals = [];
  at = 0;

  constructor(source) {
    this.source = source;
  }

  /** Code up to the end of the source, or up to the `}` closing an interpolation. */
  code(isInterpolation) {
    let depth = 0;
    let previous = "";
    while (this.at < this.source.length) {
      const char = this.source[this.at];
      const skipped = this.skipped(char, previous);
      if (skipped === "token") previous = char;
      if (skipped !== null) continue;
      if (isInterpolation && char === "}" && depth === 0) return void this.at++;
      if (char === "{") depth++;
      if (char === "}") depth--;
      if (!/\s/.test(char)) previous = char;
      this.at++;
    }
  }

  /**
   * Consumes what starts here unless it is plain code: a comment ("comment"),
   * a literal or a regular expression ("token"); null for plain code.
   */
  skipped(char, previous) {
    const next = this.source[this.at + 1];
    if (char === "/" && next === "/") this.at = this.endOf("\n", this.at);
    else if (char === "/" && next === "*") this.at = this.endOf("*/", this.at + 2) + 1;
    else return this.token(char, previous);
    return "comment";
  }

  token(char, previous) {
    if (char === '"' || char === "'") this.literals.push(this.string(char));
    else if (char === "`") this.literals.push(this.template());
    else if (char === "/" && (previous === "" || REGEX_PREFIXES.has(previous))) this.regex();
    else return null;
    return "token";
  }

  endOf(marker, from) {
    const index = this.source.indexOf(marker, from);
    return index === -1 ? this.source.length : index + 1;
  }

  /** @returns {StringLiteral} */
  string(quote) {
    let text = "";
    this.at++;
    while (this.at < this.source.length && this.source[this.at] !== quote) {
      if (this.source[this.at] === "\n") return { kind: "string", text };
      text += this.character();
    }
    this.at++;
    return { kind: "string", text };
  }

  /** @returns {TemplateLiteral} */
  template() {
    const parts = [""];
    this.at++;
    while (this.at < this.source.length && this.source[this.at] !== "`") {
      if (this.source.startsWith("${", this.at)) {
        this.at += 2;
        this.code(true);
        parts.push("");
      } else {
        parts[parts.length - 1] += this.character();
      }
    }
    this.at++;
    return { kind: "template", parts };
  }

  /** The character at the cursor, escapes resolved; moves past it. */
  character() {
    if (this.source[this.at] !== "\\") return this.source[this.at++];
    const { text, next } = unescape(this.source, this.at);
    this.at = next;
    return text;
  }

  regex() {
    let isInClass = false;
    this.at++;
    while (this.at < this.source.length && this.source[this.at] !== "\n") {
      const char = this.source[this.at];
      this.at += char === "\\" ? 2 : 1;
      if (char === "[") isInClass = true;
      if (char === "]") isInClass = false;
      if (char === "/" && !isInClass) return;
    }
  }
}

/** @param {string} source @returns {Literal[]} */
export function tsLiterals(source) {
  const lexer = new Lexer(source.replaceAll("\r\n", "\n"));
  lexer.code(false);
  return lexer.literals;
}
