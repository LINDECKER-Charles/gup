import { RustupProvider } from "../../../src/providers/rust/rustup.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { fixture, golden } from "../../support/fixtures/refs.js";
import { CARGO_HOME_BIN } from "./rust.cases.js";

/**
 * rustup on its real `rustup check` (a toolchain behind, rustup current),
 * recorded on Windows 11 by `npm run fixtures:record`. The golden holds what
 * the parser makes of it today: the dated commit `(48a229cea 2026-09-01)`
 * stops the toolchain regex, so the behind toolchain is not listed (design
 * note, findings). `rustup check` exits 100 when something is behind.
 */
const RUSTUP_RECORDED: ProviderContractCase = {
  scenario: "recorded on windows",
  create: () => new RustupProvider(),
  system: {
    platform: "win32",
    bin: { rustup: `${CARGO_HOME_BIN}\\rustup.exe` },
    commands: [
      {
        argv: ["rustup", "check"],
        stdout: fixture("providers/rust/rustup/check.win32.txt"),
        exitCode: 100,
      },
    ],
  },
  outdated: golden("rust", "rustup.recorded.win32"),
  updateAll: "one-batch",
  batchInstalls: [["rustup", "update"]],
};

export const recordedRustCases: readonly ProviderContractCase[] = [RUSTUP_RECORDED];
