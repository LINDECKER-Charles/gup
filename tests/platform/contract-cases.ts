import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { ProviderContractCase } from "../support/contract/types.js";

/**
 * Every contract case of every provider domain, found on disk: each
 * `tests/providers/<domain>/*.cases.ts` module, each exported array of cases.
 * A domain or a case file added later joins the simulation without an edit
 * here. A case reachable from two exports is kept once.
 */

const PROVIDERS_DIR = fileURLToPath(new URL("../providers/", import.meta.url));

function isContractCase(value: unknown): value is ProviderContractCase {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProviderContractCase>;
  return (
    typeof candidate.create === "function" &&
    typeof candidate.system === "object" &&
    typeof candidate.updateAll === "string" &&
    candidate.outdated !== undefined
  );
}

function isCaseList(value: unknown): value is readonly ProviderContractCase[] {
  return Array.isArray(value) && value.length > 0 && value.every(isContractCase);
}

/** The case modules, as paths relative to tests/providers/, in a stable order. */
async function caseModules(): Promise<string[]> {
  // The real fs: in the providers project, node:fs is the fake machine's.
  const { globSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
  return globSync("*/*.cases.ts", { cwd: PROVIDERS_DIR })
    .map((file) => file.split("\\").join("/"))
    .sort();
}

export interface DomainCase {
  /** `<domain>/<file>`, for the test titles. */
  readonly source: string;
  readonly case: ProviderContractCase;
}

export async function loadContractCases(): Promise<readonly DomainCase[]> {
  const seen = new Set<ProviderContractCase>();
  const found: DomainCase[] = [];
  for (const source of await caseModules()) {
    const exports = (await import(`${PROVIDERS_DIR}${source}`)) as Record<string, unknown>;
    for (const value of Object.values(exports).filter(isCaseList)) {
      for (const contractCase of value.filter((entry) => !seen.has(entry))) {
        seen.add(contractCase);
        found.push({ source: source.replace(/\.cases\.ts$/, ""), case: contractCase });
      }
    }
  }
  return found;
}
