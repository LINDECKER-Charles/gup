/**
 * A count's two forms, as the client's `tn()` picks them: `one` where the
 * plural rules of the report's Intl locale say "one" (1 in English, 0 and 1
 * in French), `other` everywhere else. `{n}` is the formatted count.
 */
export const plural = (one: string, other: string) => ({ one, other }) as const;
