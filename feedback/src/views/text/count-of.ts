const NUMBER = new Intl.NumberFormat("fr-FR");

/** `0 retour`, `1 retour`, `12 retours`: French keeps 0 and 1 singular. */
export function countOf(count: number, noun: { one: string; many: string }): string {
  return `${NUMBER.format(count)} ${count > 1 ? noun.many : noun.one}`;
}
