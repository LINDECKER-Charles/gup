import type { OutdatedPackage, ProviderScanResult } from "../../../src/core/types.js";

/**
 * The contract of `gup list --json`, checked on what the built CLI really
 * printed: an array of `ProviderScanResult`, one per scanned provider, and
 * nothing else. Scripts parse this output; a renamed or extra field is a
 * breaking change, so unknown keys fail too.
 */

type Field = "string" | "boolean";

const RESULT_FIELDS: Readonly<Record<string, Field | "packages">> = {
  providerId: "string",
  available: "boolean",
  packages: "packages",
  error: "string",
};
const RESULT_REQUIRED = ["providerId", "available", "packages"];

const PACKAGE_FIELDS: Readonly<Record<keyof OutdatedPackage, Field>> = {
  id: "string",
  name: "string",
  current: "string",
  latest: "string",
  note: "string",
  installedBy: "string",
  manual: "boolean",
  requiresAdmin: "boolean",
  aggregate: "boolean",
  updateAfterExit: "string",
};
const PACKAGE_REQUIRED = ["id", "current", "latest"];

export function assertScanResults(value: unknown): asserts value is ProviderScanResult[] {
  if (!Array.isArray(value)) fail("", `expected an array, got ${kind(value)}`);
  const seen = new Set<string>();
  value.forEach((result: unknown, index) => {
    const at = `[${index}]`;
    const record = checkedRecord(result, { at, fields: RESULT_FIELDS, required: RESULT_REQUIRED });
    const providerId = record["providerId"] as string;
    if (providerId === "" || seen.has(providerId)) {
      fail(at, `providerId "${providerId}" is empty or repeated`);
    }
    seen.add(providerId);
    const packages = record["packages"] as unknown[];
    packages.forEach((pkg, row) => assertPackage(pkg, `${at}.packages[${row}]`));
  });
}

function assertPackage(value: unknown, at: string): void {
  const record = checkedRecord(value, { at, fields: PACKAGE_FIELDS, required: PACKAGE_REQUIRED });
  if (record["id"] === "") fail(at, "id is empty");
  // `gup list` drops the rows nobody can update; one surviving would be a leak of the filter.
  if (record["manual"] === true) fail(at, "a manual row reached the output");
}

interface Shape {
  readonly at: string;
  readonly fields: Readonly<Record<string, Field | "packages">>;
  readonly required: readonly string[];
}

function checkedRecord(value: unknown, shape: Shape): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(shape.at, `expected an object, got ${kind(value)}`);
  }
  const record = value as Record<string, unknown>;
  for (const name of shape.required) {
    if (!(name in record)) fail(shape.at, `missing "${name}"`);
  }
  for (const [name, field] of Object.entries(record)) {
    const expected = shape.fields[name];
    if (expected === undefined) fail(shape.at, `unknown field "${name}"`);
    if (kind(field) !== (expected === "packages" ? "array" : expected)) {
      fail(shape.at, `"${name}" should be ${expected}, got ${kind(field)}`);
    }
  }
  return record;
}

function kind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return value === null ? "null" : typeof value;
}

function fail(at: string, problem: string): never {
  throw new TypeError(`scan results${at}: ${problem}`);
}
