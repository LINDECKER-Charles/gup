import { MintProvider } from "../../../src/providers/lang-other/mint.js";
import { VcpkgProvider } from "../../../src/providers/lang-other/vcpkg.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { SystemSpec } from "../../support/system/types.js";

/**
 * Language ecosystems without a home of their own. Sample outputs are
 * exported: the knowledge tests of each provider start from the same machine.
 */

// --- vcpkg ------------------------------------------------------------------

export const VCPKG_BIN = "C:\\vcpkg\\vcpkg.exe";
export const VCPKG_REBUILD_NOTE = "reconstruction depuis les sources — peut être long";
export const VCPKG_UPGRADE = ["vcpkg", "upgrade", "--no-dry-run", "--no-keep-going"];

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

export const langOtherCases: readonly ProviderContractCase[] = [VCPKG, MINT];
