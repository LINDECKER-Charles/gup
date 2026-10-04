/**
 * The values that turn one of gup's on-by-default `GUP_*` switches off
 * (`GUP_HISTORY`, `GUP_CONFIG`, `GUP_PTY`), whatever their case and with
 * surrounding blanks ignored. Anything else — unset, empty, `1`, `on` —
 * leaves the feature on.
 */
const OFF_VALUES: ReadonlySet<string> = new Set(["0", "false", "off", "no"]);

/** True when `value` (an environment variable's raw text) turns its switch off. */
export function isSwitchedOff(value: string | undefined): boolean {
  return value !== undefined && OFF_VALUES.has(value.trim().toLowerCase());
}
