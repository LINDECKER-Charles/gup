import { CoursierCsProvider } from "../../../src/providers/jvm/coursier-cs.js";
import { JBangProvider } from "../../../src/providers/jvm/jbang.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * JVM launchers that update themselves: the latest version comes from their
 * GitHub releases, the upgrade from their own command. The machines a
 * knowledge test starts from are exported; the rest stays private.
 */

// --- Coursier -----------------------------------------------------------------

export const COURSIER_VERSION_ARGV = ["cs", "--version"];
export const COURSIER_RELEASE = githubLatest("coursier/coursier", "v2.1.12");

/** `cs` installed by its own launcher, printing `banner`, GitHub answering `release`. */
export function coursierMachine(banner: string, release = COURSIER_RELEASE): SystemSpec {
  return {
    platform: "linux",
    bin: { cs: "/home/u/.local/share/coursier/bin/cs" },
    commands: [{ argv: COURSIER_VERSION_ARGV, stdout: banner }],
    http: [release],
  };
}

const COURSIER_BANNER = "Coursier 2.1.10 (commit deadbeef)";

const COURSIER: ProviderContractCase = {
  create: () => new CoursierCsProvider(),
  system: coursierMachine(COURSIER_BANNER),
  outdated: [
    {
      id: "coursier-cs",
      name: "Coursier (cs)",
      current: "2.1.10",
      latest: "2.1.12",
      note: "runs `cs update` for installed apps",
    },
  ],
  // `cs update` refreshes every installed app shim along with the launcher.
  update: { packageId: "coursier-cs", installs: [["cs", "update"]] },
  updateAll: "collapsed",
};

const COURSIER_UP_TO_DATE: ProviderContractCase = {
  scenario: "up to date",
  create: () => new CoursierCsProvider(),
  system: coursierMachine(COURSIER_BANNER, githubLatest("coursier/coursier", "v2.1.10")),
  outdated: [],
  updateAll: "collapsed",
};

// --- JBang --------------------------------------------------------------------

export const JBANG_VERSION_ARGV = ["jbang", "version"];

/** JBang printing `stdout` for `jbang version`, GitHub answering `tag`. */
export function jbangMachine(stdout: string, tag = "v0.119.0"): SystemSpec {
  return {
    platform: "win32",
    bin: { jbang: "C:\\Users\\u\\.jbang\\bin\\jbang.cmd" },
    commands: [{ argv: JBANG_VERSION_ARGV, stdout }],
    http: [githubLatest("jbangdev/jbang", tag)],
  };
}

const JBANG: ProviderContractCase = {
  create: () => new JBangProvider(),
  system: jbangMachine("0.118.0"),
  outdated: [{ id: "jbang", name: "JBang", current: "0.118.0", latest: "0.119.0" }],
  update: { packageId: "jbang", installs: [["jbang", "version", "--update"]] },
  updateAll: "collapsed",
};

const JBANG_UP_TO_DATE: ProviderContractCase = {
  scenario: "up to date",
  create: () => new JBangProvider(),
  system: jbangMachine("0.118.0", "v0.118.0"),
  outdated: [],
  updateAll: "collapsed",
};

export const jvmCases: readonly ProviderContractCase[] = [
  COURSIER,
  COURSIER_UP_TO_DATE,
  JBANG,
  JBANG_UP_TO_DATE,
];
