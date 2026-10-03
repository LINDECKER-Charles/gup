import { system } from "./fake-system.js";
import type { SpawnRecord } from "./types.js";

/**
 * Readers of the fake machine's trace for knowledge tests: what the code
 * under test spawned since the machine was loaded, in order.
 */

/** The installs (`runInherit`), with their shell flag and cwd. */
export function installs(): readonly SpawnRecord[] {
  return system.trace.spawns.filter((spawn) => spawn.mode === "inherit");
}

/** The argv of every install. */
export function installArgvs(): (readonly string[])[] {
  return installs().map((spawn) => spawn.argv);
}

/** The argv of every probe (`run`), `where`/`which` lookups included. */
export function probeArgvs(): (readonly string[])[] {
  return system.trace.spawns.filter((spawn) => spawn.mode === "run").map((spawn) => spawn.argv);
}
