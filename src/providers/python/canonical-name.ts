/** PEP 503: case, `-`, `_` and `.` do not tell two project names apart. */
const NAME_SEPARATORS = /[-_.]+/g;

/** The name pip compares projects by: `pydantic_core` and `Pydantic-Core` are one project. */
export function canonicalName(name: string): string {
  return name.toLowerCase().replace(NAME_SEPARATORS, "-");
}
