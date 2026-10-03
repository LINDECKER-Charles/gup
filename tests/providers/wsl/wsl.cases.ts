import { WslProvider } from "../../../src/providers/wsl/wsl.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";

/**
 * WSL itself, and the machine every WSL provider runs on: wsl.exe on a
 * Windows PATH, whose console output is UTF-16 LE. Read through gup's UTF-8
 * decoding, each ASCII character arrives followed by a NUL, and that is the
 * form these outputs take.
 */

const WSL_EXE = "C:\\Windows\\System32\\wsl.exe";
export const WSL_VERSION_ARGV = ["wsl", "--version"];

/** UTF-16 LE text as gup receives it once decoded as UTF-8: a NUL after each character. */
export function asUtf16(text: string): string {
  return [...text].map((character) => `${character}\u0000`).join("");
}

/** Windows with wsl.exe on PATH, answering `commands`. */
export function wslHost(commands: readonly CommandScript[]): SystemSpec {
  return { platform: "win32", bin: { wsl: WSL_EXE }, commands };
}

/** The first lines of `wsl --version` for WSL `version`. */
export function wslVersionBanner(version: string): string {
  return [
    `WSL version: ${version}`,
    "Kernel version: 5.15.167.4-1",
    "WSLg version: 1.0.65",
    "MSRDC version: 1.2.5716",
  ].join("\r\n");
}

/** WSL 2.1.0.0, `wsl --version` printed in UTF-16 as the console does. */
const WSL_KERNEL: SelfUpdatingTool = {
  create: () => new WslProvider(),
  system: wslHost([{ argv: WSL_VERSION_ARGV, stdout: asUtf16(wslVersionBanner("2.1.0.0")) }]),
  release: githubLatest("microsoft/WSL", "2.5.10"),
  row: { id: "wsl", name: "WSL", current: "2.1.0.0", latest: "2.5.10" },
  // A `v` on the tag is dropped before the comparison.
  upToDate: githubLatest("microsoft/WSL", "v2.1.0.0"),
  installs: [["wsl", "--update"]],
};

export const wslCases: readonly ProviderContractCase[] = [
  ...selfUpdatingToolCases(WSL_KERNEL),
  nothingListedOn(WSL_KERNEL, "release without a tag", {
    ...githubLatest("microsoft/WSL", ""),
    json: {},
  }),
];
