/**
 * The class attribute of the names given, the falsy ones skipped; undefined
 * when none is left, so React renders no empty `class`.
 *
 * @param {...(string | false | null | undefined)} names
 */
export const classNames = (...names) => names.filter(Boolean).join(" ") || undefined;
