import { DOCTOR_PROVIDER_LABELS } from "../../../src/ui/text/providers-labels.js";

/**
 * `gup doctor`'s three provider groups, read back from what the built CLI
 * printed: the ids between each group's title and the next one ("Système"
 * ends them). The real-machine suites take the detected ones as the list of
 * tools this machine has.
 */

export interface DoctorGroups {
  readonly detected: readonly string[];
  readonly missing: readonly string[];
  readonly incompatible: readonly string[];
}

type Group = keyof DoctorGroups;

/**
 * `(npm-g)`: the id column. A display name may hold parentheses too
 * ("WSL (kernel)"), and the badge after it never does: the id is the last.
 */
const PARENTHESISED_ID = /\(([A-Za-z0-9][A-Za-z0-9-]*)\)/g;
/** The indented `→ …` line under a missing provider is its install hint, not a row. */
const HINT_LINE = /^\s*→/;
const SYSTEM_TITLE = "Système";

export function parseDoctor(stdout: string, platform: NodeJS.Platform): DoctorGroups {
  const titles = new Map<string, Group | null>([
    [DOCTOR_PROVIDER_LABELS.detected, "detected"],
    [DOCTOR_PROVIDER_LABELS.missing, "missing"],
    [DOCTOR_PROVIDER_LABELS.incompatible(platform), "incompatible"],
    [SYSTEM_TITLE, null],
  ]);
  const groups: Record<Group, string[]> = { detected: [], missing: [], incompatible: [] };
  let current: Group | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const title = titles.get(line.trim());
    if (title !== undefined) current = title;
    else if (current) addRow(groups[current], line);
  }
  return groups;
}

function addRow(ids: string[], line: string): void {
  if (HINT_LINE.test(line)) return;
  const id = [...line.matchAll(PARENTHESISED_ID)].at(-1)?.[1];
  if (id !== undefined) ids.push(id);
}
