import { CargoProvider } from "../../../src/providers/rust/cargo.js";
import { RustupProvider } from "../../../src/providers/rust/rustup.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * The Rust toolchain manager and the crates cargo installed. Both update in
 * one batch command; rustup also updates itself on request. The machines a
 * knowledge test starts from are exported; the rest stays private.
 */

export const CARGO_HOME_BIN = `${WIN_HOME}\\.cargo\\bin`;

// --- cargo (cargo-update plugin) ------------------------------------------------

const CARGO_PLUGIN_PROBE = ["cargo", "install-update", "--version"];

/**
 * The table layout the parser reads: header, separator, then name, one
 * ignored column, current, latest. cargo-update itself prints neither the
 * separator nor the extra column (provider-contracts.md §6).
 */
const CARGO_LIST_STDOUT = [
  "    Polling registry 'https://index.crates.io/'",
  "",
  "Package      Installed  Latest   Needs update",
  "-------      ---------  ------   ------------",
  "ripgrep      crate      v14.0.0  v14.1.1  Yes",
  "fd-find      crate      v9.0.0   v9.0.0   No",
  "bat          crate      v0.24.0  v0.25.0  Yes",
  "",
].join("\n");

/** cargo with the cargo-update plugin, whose probe answers `plugin`. */
export function cargoMachine(plugin: Omit<CommandScript, "argv">): SystemSpec {
  return {
    platform: "win32",
    bin: { cargo: `${CARGO_HOME_BIN}\\cargo.exe` },
    commands: [
      { argv: CARGO_PLUGIN_PROBE, ...plugin },
      { argv: ["cargo", "install-update", "-l"], stdout: CARGO_LIST_STDOUT },
    ],
  };
}

const CARGO: ProviderContractCase = {
  create: () => new CargoProvider(),
  system: cargoMachine({ stdout: "cargo-install-update 16.3.0" }),
  outdated: [
    { id: "ripgrep", name: "ripgrep", current: "v14.0.0", latest: "v14.1.1" },
    { id: "bat", name: "bat", current: "v0.24.0", latest: "v0.25.0" },
  ],
  update: { packageId: "ripgrep", installs: [["cargo", "install-update", "ripgrep"]] },
  updateAll: "one-batch",
  // One run upgrades every outdated crate, selected or not.
  batchInstalls: [["cargo", "install-update", "-a"]],
};

// --- rustup -------------------------------------------------------------------

/**
 * `rustup check`: a toolchain and rustup itself behind, nightly current.
 * The commit dates are written without dashes: the parser stops at the first
 * `-` after the version, so the real `(129f3b996 2024-06-10)` form is never
 * listed (provider-contracts.md §6).
 */
const RUSTUP_CHECK_STDOUT = [
  "stable-x86_64-pc-windows-msvc - Update available : 1.79.0 (129f3b996 20240610)" +
    " -> 1.80.0 (051478957 20240721)",
  "nightly-x86_64-pc-windows-msvc - Up to date : 1.81.0",
  "rustup - Update available : 1.27.1 -> 1.28.0",
  "",
].join("\n");

const RUSTUP_MACHINE: SystemSpec = {
  platform: "win32",
  bin: { rustup: `${CARGO_HOME_BIN}\\rustup.exe` },
  commands: [{ argv: ["rustup", "check"], stdout: RUSTUP_CHECK_STDOUT }],
};

const STABLE = "stable-x86_64-pc-windows-msvc";

const RUSTUP_ROWS = [
  { id: STABLE, name: STABLE, current: "1.79.0", latest: "1.80.0" },
  { id: "rustup", name: "rustup", current: "1.27.1", latest: "1.28.0" },
];

/** A toolchain is updated by name; the batch updates every toolchain and rustup itself. */
const RUSTUP_TOOLCHAIN: ProviderContractCase = {
  scenario: "toolchain",
  create: () => new RustupProvider(),
  system: RUSTUP_MACHINE,
  outdated: RUSTUP_ROWS,
  update: { packageId: STABLE, installs: [["rustup", "update", STABLE]] },
  updateAll: "one-batch",
  batchInstalls: [["rustup", "update"]],
};

/** The `rustup` row is rustup itself: `rustup update rustup` would name a toolchain. */
const RUSTUP_SELF: ProviderContractCase = {
  ...RUSTUP_TOOLCHAIN,
  scenario: "self-update",
  update: { packageId: "rustup", installs: [["rustup", "self", "update"]] },
};

export const rustCases: readonly ProviderContractCase[] = [CARGO, RUSTUP_TOOLCHAIN, RUSTUP_SELF];
