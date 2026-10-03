import { GemProvider } from "../../../src/providers/lang-other/gem.js";
import { JuliaPkgProvider } from "../../../src/providers/lang-other/julia-pkg.js";
import { LuaRocksProvider } from "../../../src/providers/lang-other/luarocks.js";
import { MintProvider } from "../../../src/providers/lang-other/mint.js";
import { MixArchiveProvider } from "../../../src/providers/lang-other/mix-archive.js";
import { NimbleProvider } from "../../../src/providers/lang-other/nimble.js";
import { OpamProvider } from "../../../src/providers/lang-other/opam.js";
import { PubGlobalProvider } from "../../../src/providers/lang-other/pub-global.js";
import { RPackagesProvider } from "../../../src/providers/lang-other/r-packages.js";
import { VcpkgProvider } from "../../../src/providers/lang-other/vcpkg.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Package managers of the language ecosystems without a home of their own
 * (the tools that update themselves are in self-updating.cases.ts). The
 * machines and outputs a knowledge test starts from are exported; the rest
 * of the case data stays private.
 */

// --- vcpkg ------------------------------------------------------------------

const VCPKG_BIN = "C:\\vcpkg\\vcpkg.exe";
export const VCPKG_REBUILD_NOTE = "reconstruction depuis les sources — peut être long";
const VCPKG_UPGRADE = ["vcpkg", "upgrade", "--no-dry-run", "--no-keep-going"];

/** `vcpkg update` in classic mode: preamble, rows, both footers. */
export const VCPKG_UPDATE_STDOUT = [
  "Using local portfile versions. To update the local portfiles, use `git pull`.",
  "The following packages differ from their port versions:",
  "        corrade:x64-windows              2020.06#4 -> 2020.06#5",
  "        openal-soft:x64-windows          1.22.2#5 -> 1.23.0",
  "To update these packages and all dependencies, run",
  ".\\vcpkg upgrade",
  "",
].join("\n");

export const VCPKG_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { vcpkg: VCPKG_BIN },
  commands: [{ argv: ["vcpkg", "update"], stdout: VCPKG_UPDATE_STDOUT }],
};

const VCPKG: ProviderContractCase = {
  create: () => new VcpkgProvider(),
  system: VCPKG_MACHINE,
  // The id is the triplet-qualified spec: exactly what `vcpkg upgrade` takes.
  outdated: [
    {
      id: "corrade:x64-windows",
      name: "corrade:x64-windows",
      current: "2020.06#4",
      latest: "2020.06#5",
      note: VCPKG_REBUILD_NOTE,
    },
    {
      id: "openal-soft:x64-windows",
      name: "openal-soft:x64-windows",
      current: "1.22.2#5",
      latest: "1.23.0",
      note: VCPKG_REBUILD_NOTE,
    },
  ],
  update: { packageId: "corrade:x64-windows", installs: [[...VCPKG_UPGRADE, "corrade:x64-windows"]] },
  updateAll: "one-batch",
  // Explicit specs: a bare `vcpkg upgrade` would rebuild every outdated port.
  batchInstalls: [[...VCPKG_UPGRADE, "corrade:x64-windows", "openal-soft:x64-windows"]],
};

// --- Mint -------------------------------------------------------------------

const MINT_BIN = "/opt/homebrew/bin/mint";
export const MINT_METADATA_FILE = "/Users/u/.mint/metadata.json";

/** `mint list`: two packages, the `*` marks the version linked into $PATH. */
export const MINT_LIST_STDOUT = [
  "🌱 Installed mint packages:",
  "  SwiftLint",
  "    - 0.59.1 (swiftlint) *",
  "  XcodeGen",
  "    - 2.42.0 (xcodegen)",
  "    - 2.43.0 (xcodegen) *",
  "",
].join("\n");

/** Mint's own metadata.json: the only place that knows each package's owner. */
export const MINT_METADATA = JSON.stringify({
  packages: {
    "https://github.com/realm/SwiftLint.git": "realm_SwiftLint",
    "https://github.com/yonaskolb/XcodeGen.git": "yonaskolb_XcodeGen",
  },
});

/** SwiftLint has a newer release; XcodeGen is current. */
export const MINT_MACHINE: SystemSpec = {
  platform: "darwin",
  bin: { mint: MINT_BIN },
  commands: [{ argv: ["mint", "list"], stdout: MINT_LIST_STDOUT }],
  fs: { [MINT_METADATA_FILE]: { kind: "file", content: MINT_METADATA } },
  http: [githubLatest("realm/SwiftLint", "0.60.0"), githubLatest("yonaskolb/XcodeGen", "2.43.0")],
};

const MINT: ProviderContractCase = {
  create: () => new MintProvider(),
  system: MINT_MACHINE,
  outdated: [
    { id: "realm/SwiftLint", name: "realm/SwiftLint", current: "0.59.1", latest: "0.60.0" },
  ],
  // The tag is resolved again and pinned: a bare install would read a local Mintfile.
  update: {
    packageId: "realm/SwiftLint",
    installs: [["mint", "install", "realm/SwiftLint@0.60.0"]],
    onFailure: { success: false, message: "échec de « mint install realm/SwiftLint@0.60.0 »" },
  },
  updateAll: "per-package",
};

// --- RubyGems -------------------------------------------------------------------

const GEM: ProviderContractCase = {
  create: () => new GemProvider(),
  system: {
    platform: "win32",
    bin: { gem: "C:\\Ruby33-x64\\bin\\gem.cmd" },
    commands: [
      { argv: ["gem", "outdated"], stdout: "bundler (2.5.11 < 2.5.16)\nrake (13.2.0 < 13.2.1)\n" },
    ],
  },
  outdated: [
    { id: "bundler", name: "bundler", current: "2.5.11", latest: "2.5.16" },
    { id: "rake", name: "rake", current: "13.2.0", latest: "13.2.1" },
  ],
  update: { packageId: "rake", installs: [["gem", "update", "rake"]] },
  updateAll: "one-batch",
  // A bare `gem update` upgrades every outdated gem, selected or not.
  batchInstalls: [["gem", "update"]],
};

// --- Julia Pkg ------------------------------------------------------------------

const JULIA_UPDATE = ["julia", "--startup-file=no", "-e", "using Pkg; Pkg.update()"];

/**
 * `Pkg.status(outdated=true)` lines as the parser reads them: the
 * `[uuid]` first (provider-contracts.md §6 on Pkg's status markers).
 */
const JULIA_STATUS_STDOUT = [
  "Status `~/.julia/environments/v1.10/Project.toml`",
  "  [91a5bcdd-55d7-5caf-9e0b-520d859cae80] Plots v1.40.4 (<v1.40.5)",
  "  [a93c6f00-e57d-5684-b7b6-d8193f3e46c0] DataFrames v1.6.0 (<v1.6.1)",
  "",
].join("\n");

/** Julia resolves the whole environment: every row updates everything. */
const JULIA_PKG: ProviderContractCase = {
  create: () => new JuliaPkgProvider(),
  system: {
    platform: "linux",
    bin: { julia: "/home/u/.juliaup/bin/julia" },
    commands: [
      {
        argv: ["julia", "--startup-file=no", "-e", "using Pkg; Pkg.status(outdated=true)"],
        stdout: JULIA_STATUS_STDOUT,
      },
    ],
  },
  outdated: [
    { id: "Plots", name: "Plots", current: "1.40.4", latest: "1.40.5", aggregate: true },
    {
      id: "DataFrames",
      name: "DataFrames",
      current: "1.6.0",
      latest: "1.6.1",
      aggregate: true,
    },
  ],
  update: {
    packageId: "Plots",
    installs: [JULIA_UPDATE],
    outcome: { id: "julia-pkg" },
    onFailure: { id: "julia-pkg", success: false },
  },
  updateAll: "one-batch",
  batchInstalls: [JULIA_UPDATE],
  waivers: [
    {
      invariant: "outcome-id",
      reason: "Pkg.update() resolves the whole environment: the outcome names the provider",
    },
  ],
};

// --- LuaRocks -------------------------------------------------------------------

export const LUAROCKS_OUTDATED_ARGV = ["luarocks", "--local", "list", "--outdated", "--porcelain"];

/** LuaRocks from Homebrew, `--porcelain` answering `stdout` for the user tree. */
export function luarocksMachine(stdout: string): SystemSpec {
  return {
    platform: "darwin",
    bin: { luarocks: "/opt/homebrew/bin/luarocks" },
    commands: [{ argv: LUAROCKS_OUTDATED_ARGV, stdout }],
  };
}

const LUAROCKS: ProviderContractCase = {
  create: () => new LuaRocksProvider(),
  system: luarocksMachine(
    [
      "lpeg\t1.0.2-1\t1.1.0-1\thttps://luarocks.org",
      "luaposix\t35.1-1\t36.2.1-1\thttps://luarocks.org",
    ].join("\n"),
  ),
  outdated: [
    { id: "lpeg", name: "lpeg", current: "1.0.2-1", latest: "1.1.0-1" },
    { id: "luaposix", name: "luaposix", current: "35.1-1", latest: "36.2.1-1" },
  ],
  update: { packageId: "lpeg", installs: [["luarocks", "--local", "install", "lpeg"]] },
  updateAll: "per-package",
};

// --- Mix archives ---------------------------------------------------------------

export const MIX_ARCHIVE_ARGV = ["mix", "archive"];

/** hex.pm's entry for one archive. */
export function hexPackageRoute(name: string, json: unknown): HttpRoute {
  return { url: `https://hex.pm/api/packages/${name}`, json };
}

/** Elixir from Homebrew whose `mix archive` answers `answer`. */
export function mixArchiveMachine(
  answer: Omit<CommandScript, "argv">,
  http: readonly HttpRoute[] = [],
): SystemSpec {
  return {
    platform: "darwin",
    bin: { mix: "/opt/homebrew/bin/mix" },
    commands: [{ argv: MIX_ARCHIVE_ARGV, ...answer }],
    http,
  };
}

/**
 * Three archives, one lookup each: Hex behind its stable release, phx_new
 * behind a package with no stable release yet, nerves_bootstrap current.
 */
const MIX_ARCHIVE: ProviderContractCase = {
  create: () => new MixArchiveProvider(),
  system: mixArchiveMachine(
    {
      stdout: [
        "* hex-2.0.0",
        "* phx_new-1.7.0",
        "* nerves_bootstrap-1.12.0",
        "Archives installed at: /Users/u/.mix/archives",
      ].join("\n"),
    },
    [
      hexPackageRoute("hex", { latest_stable_version: "2.0.6" }),
      hexPackageRoute("phx_new", { latest_version: "1.7.14" }),
      hexPackageRoute("nerves_bootstrap", { latest_stable_version: "1.12.0" }),
    ],
  ),
  outdated: [
    { id: "hex", name: "hex", current: "2.0.0", latest: "2.0.6" },
    { id: "phx_new", name: "phx_new", current: "1.7.0", latest: "1.7.14" },
  ],
  update: {
    packageId: "phx_new",
    installs: [["mix", "archive.install", "hex", "phx_new", "--force"]],
  },
  updateAll: "per-package",
};

// --- Nimble ---------------------------------------------------------------------

export const NIM_REGISTRY_URL =
  "https://raw.githubusercontent.com/nim-lang/packages/master/packages.json";

/** The GitHub API's latest release of `ownerRepo`, as nimble asks for it. */
export function nimbleReleaseRoute(ownerRepo: string, json: unknown): HttpRoute {
  return { url: `https://api.github.com/repos/${ownerRepo}/releases/latest`, json };
}

/** Nimble listing `installed`, the registry answering `registry`, GitHub answering `releases`. */
export function nimbleMachine(
  installed: readonly string[],
  registry: unknown,
  releases: readonly HttpRoute[] = [],
): SystemSpec {
  return {
    platform: "linux",
    bin: { nimble: "/home/u/.nimble/bin/nimble" },
    commands: [{ argv: ["nimble", "list", "--installed"], stdout: installed.join("\n") }],
    http: [{ url: NIM_REGISTRY_URL, json: registry }, ...releases],
  };
}

/** Three packages, the registry naming their repositories, one release lookup each. */
const NIMBLE: ProviderContractCase = {
  create: () => new NimbleProvider(),
  system: nimbleMachine(
    ["jester  [0.5.0]", "karax  [1.3.3]", "nimja  [0.8.7]"],
    [
      { name: "jester", url: "https://github.com/dom96/jester" },
      { name: "karax", url: "https://github.com/karaxnim/karax.git" },
      { name: "nimja", url: "https://github.com/enthus1ast/nimja" },
    ],
    [
      nimbleReleaseRoute("dom96/jester", { tag_name: "v0.6.0" }),
      nimbleReleaseRoute("karaxnim/karax", { tag_name: "1.4.0" }),
      nimbleReleaseRoute("enthus1ast/nimja", { tag_name: "v0.8.7" }),
    ],
  ),
  outdated: [
    { id: "jester", name: "jester", current: "0.5.0", latest: "0.6.0" },
    { id: "karax", name: "karax", current: "1.3.3", latest: "1.4.0" },
  ],
  update: { packageId: "karax", installs: [["nimble", "install", "karax", "-y"]] },
  updateAll: "per-package",
};

// --- opam -----------------------------------------------------------------------

export const OPAM_UPDATE_ARGV = ["opam", "update", "--quiet"];
export const OPAM_LIST_ARGV = [
  "opam",
  "list",
  "--upgradable",
  "--short",
  "--columns=name,installed-version,version",
];

/** opam whose metadata refresh succeeds and whose upgradable list prints `stdout`. */
export function opamMachine(stdout: string): SystemSpec {
  return {
    platform: "linux",
    bin: { opam: "/usr/bin/opam" },
    commands: [
      { argv: OPAM_UPDATE_ARGV, stdout: "" },
      { argv: OPAM_LIST_ARGV, stdout },
    ],
  };
}

const OPAM: ProviderContractCase = {
  create: () => new OpamProvider(),
  system: opamMachine("core v0.16.0 v0.17.1\ndune 3.15.0 3.16.0\n"),
  outdated: [
    { id: "core", name: "core", current: "v0.16.0", latest: "v0.17.1" },
    { id: "dune", name: "dune", current: "3.15.0", latest: "3.16.0" },
  ],
  update: { packageId: "dune", installs: [["opam", "upgrade", "dune", "-y"]] },
  updateAll: "one-batch",
  // One solver pass over the whole switch.
  batchInstalls: [["opam", "upgrade", "-y"]],
};

// --- Dart pub global ------------------------------------------------------------

/** pub.dev's entry for one package. */
export function pubDevRoute(name: string, json: unknown): HttpRoute {
  return { url: `https://pub.dev/api/packages/${name}`, json };
}

const PUB_LIST_STDOUT = "melos 3.4.0\nvery_good_cli 0.22.1\nstagehand 3.3.11\n";

const PUB_ROUTES: readonly HttpRoute[] = [
  pubDevRoute("melos", { latest: { version: "6.1.0" } }),
  pubDevRoute("very_good_cli", { latest: { version: "0.22.1" } }),
  pubDevRoute("stagehand", { latest: { version: "3.3.12" } }),
];

const PUB_ROWS = [
  { id: "melos", name: "melos", current: "3.4.0", latest: "6.1.0" },
  { id: "stagehand", name: "stagehand", current: "3.3.11", latest: "3.3.12" },
];

/** The Dart SDK printing `stdout` for `dart pub global list`. */
export function dartMachine(stdout: string, http: readonly HttpRoute[] = []): SystemSpec {
  return {
    platform: "win32",
    bin: { dart: "C:\\tools\\dart-sdk\\bin\\dart.exe" },
    commands: [{ argv: ["dart", "pub", "global", "list"], stdout }],
    http,
  };
}

const PUB_GLOBAL: ProviderContractCase = {
  scenario: "dart",
  create: () => new PubGlobalProvider(),
  system: dartMachine(PUB_LIST_STDOUT, PUB_ROUTES),
  outdated: PUB_ROWS,
  update: { packageId: "melos", installs: [["dart", "pub", "global", "activate", "melos"]] },
  updateAll: "per-package",
};

/** Dart ships inside Flutter: a Flutter-only machine goes through `flutter pub`. */
const PUB_GLOBAL_VIA_FLUTTER: ProviderContractCase = {
  scenario: "flutter only",
  create: () => new PubGlobalProvider(),
  system: {
    platform: "darwin",
    bin: { flutter: "/Users/u/development/flutter/bin/flutter" },
    commands: [{ argv: ["flutter", "pub", "global", "list"], stdout: PUB_LIST_STDOUT }],
    http: PUB_ROUTES,
  },
  outdated: PUB_ROWS,
  update: { packageId: "melos", installs: [["flutter", "pub", "global", "activate", "melos"]] },
  updateAll: "per-package",
};

// --- R (CRAN) -------------------------------------------------------------------

const CRAN = "https://cloud.r-project.org";

/** The R script the scan runs: `old.packages()` of the user library, one TSV row each. */
const R_SCAN_SCRIPT = [
  "op <- tryCatch(old.packages(lib.loc = .libPaths()[1]), error = function(e) NULL)",
  "if (!is.null(op) && nrow(op) > 0) {",
  "  for (i in seq_len(nrow(op))) {",
  '    cat(sprintf("%s\\t%s\\t%s\\n", op[i, "Package"], op[i, "Installed"], op[i, "ReposVer"]))',
  "  }",
  "}",
].join("; ");

/** R whose scan script prints `stdout`. */
export function rMachine(stdout: string): SystemSpec {
  return {
    platform: "linux",
    bin: { Rscript: "/usr/bin/Rscript" },
    commands: [{ argv: ["Rscript", "--vanilla", "-e", R_SCAN_SCRIPT], stdout }],
  };
}

/** `install.packages` of one package into the user library. */
export function rInstallArgv(name: string): string[] {
  const call = `install.packages('${name}', lib = .libPaths()[1], repos = '${CRAN}')`;
  return ["Rscript", "--vanilla", "-e", call];
}

const R_PACKAGES: ProviderContractCase = {
  create: () => new RPackagesProvider(),
  system: rMachine("ggplot2\t3.4.0\t3.5.1\ndplyr\t1.1.0\t1.1.4\n"),
  outdated: [
    { id: "ggplot2", name: "ggplot2", current: "3.4.0", latest: "3.5.1" },
    { id: "dplyr", name: "dplyr", current: "1.1.0", latest: "1.1.4" },
  ],
  update: { packageId: "ggplot2", installs: [rInstallArgv("ggplot2")] },
  updateAll: "one-batch",
  batchInstalls: [
    [
      "Rscript",
      "--vanilla",
      "-e",
      `update.packages(lib.loc = .libPaths()[1], ask = FALSE, repos = '${CRAN}')`,
    ],
  ],
};

export const langOtherCases: readonly ProviderContractCase[] = [
  VCPKG,
  MINT,
  GEM,
  JULIA_PKG,
  LUAROCKS,
  MIX_ARCHIVE,
  NIMBLE,
  OPAM,
  PUB_GLOBAL,
  PUB_GLOBAL_VIA_FLUTTER,
  R_PACKAGES,
];
