const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/**
 * Markup known to be safe. Only `html` builds one: the class itself stays
 * private to this module, so no caller can wrap an arbitrary string.
 */
class SafeHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}

export type { SafeHtml };

export type HtmlValue =
  SafeHtml | string | number | boolean | null | undefined | readonly HtmlValue[];

function render(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false || value === true) return "";
  return escapeText(String(value));
}

/**
 * Tagged template that escapes every interpolation unless it is a SafeHtml
 * (nested `html` output). Arrays are rendered item by
 * item; null, undefined and booleans render nothing, so `cond && html\`…\``
 * reads naturally.
 */
export function html(strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml {
  let markup = strings[0] ?? "";
  for (const [index, value] of values.entries()) {
    markup += render(value) + (strings[index + 1] ?? "");
  }
  return new SafeHtml(markup);
}
