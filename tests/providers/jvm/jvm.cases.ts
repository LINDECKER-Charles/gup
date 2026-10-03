import { CoursierCsProvider } from "../../../src/providers/jvm/coursier-cs.js";
import { JBangProvider } from "../../../src/providers/jvm/jbang.js";
import {
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * JVM launchers that update themselves: the latest version comes from their
 * GitHub releases, the upgrade from their own command. The machines a
 * knowledge test starts from are exported; the rest stays private.
 */

// --- Coursier -----------------------------------------------------------------

export const COURSIER_RELEASE = githubLatest("coursier/coursier", "v2.1.12");

/** `cs` installed by its own launcher, printing `banner`. */
export function coursierMachine(banner: string): SystemSpec {
  return {
    platform: "linux",
    bin: { cs: "/home/u/.local/share/coursier/bin/cs" },
    commands: [{ argv: ["cs", "--version"], stdout: banner }],
  };
}

const COURSIER: SelfUpdatingTool = {
  create: () => new CoursierCsProvider(),
  system: coursierMachine("Coursier 2.1.10 (commit deadbeef)"),
  release: COURSIER_RELEASE,
  row: {
    id: "coursier-cs",
    name: "Coursier (cs)",
    current: "2.1.10",
    latest: "2.1.12",
    note: "runs `cs update` for installed apps",
  },
  upToDate: githubLatest("coursier/coursier", "v2.1.10"),
  // `cs update` refreshes every installed app shim along with the launcher.
  installs: [["cs", "update"]],
};

// --- JBang --------------------------------------------------------------------

export const JBANG_RELEASE = githubLatest("jbangdev/jbang", "v0.119.0");

/** JBang printing `stdout` for `jbang version`. */
export function jbangMachine(stdout: string): SystemSpec {
  return {
    platform: "win32",
    bin: { jbang: "C:\\Users\\u\\.jbang\\bin\\jbang.cmd" },
    commands: [{ argv: ["jbang", "version"], stdout }],
  };
}

const JBANG: SelfUpdatingTool = {
  create: () => new JBangProvider(),
  system: jbangMachine("0.118.0"),
  release: JBANG_RELEASE,
  row: { id: "jbang", name: "JBang", current: "0.118.0", latest: "0.119.0" },
  upToDate: githubLatest("jbangdev/jbang", "v0.118.0"),
  installs: [["jbang", "version", "--update"]],
};

export const jvmCases: readonly ProviderContractCase[] = [COURSIER, JBANG].flatMap(
  selfUpdatingToolCases,
);
