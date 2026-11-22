/** Outcome of validating untrusted input: the typed value, or the invalid field names. */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly fields: readonly string[] };
