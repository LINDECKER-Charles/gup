function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalise(record[key])]),
  );
}

/**
 * JSON with object keys sorted at every depth: two records that differ only by
 * key order serialise identically, so their hash is the deduplication key.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}
