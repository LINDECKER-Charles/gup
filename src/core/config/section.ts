import type { FieldReader } from "./field-reader.js";

/**
 * A namespace of the settings file, owned by one feature. Each feature
 * declares its section next to its code and the store stays ignorant of what
 * the sections hold (dependency inversion): the store handles the file, the
 * section turns raw JSON into its typed value.
 */

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ConfigSectionDef<T extends object> {
  /** Namespace in the file, `/^[a-z][a-z0-9-]{0,31}$/` — checked by {@link defineSection}. */
  readonly key: string;
  /** Shape version, written as `v`. A positive integer. */
  readonly version: number;
  /** Every field's default. Only fields that differ from it are written. */
  readonly defaults: T;
  /** Build T through a lenient reader. Never throws: an invalid field falls back to its default. */
  parse(read: FieldReader): T;
  /** Upgrade an older on-disk shape before parse(). Absent: older fields are read as they are. */
  migrate?(raw: JsonObject, fromVersion: number): JsonObject;
}

const SECTION_KEY = /^[a-z][a-z0-9-]{0,31}$/;

/** Validate a section definition once, at module load of its owner. */
export function defineSection<T extends object>(def: ConfigSectionDef<T>): ConfigSectionDef<T> {
  if (!SECTION_KEY.test(def.key)) {
    throw new Error(`config: invalid section key "${def.key}"`);
  }
  if (!Number.isInteger(def.version) || def.version < 1) {
    throw new Error(`config: section "${def.key}" needs a positive integer version`);
  }
  return def;
}
