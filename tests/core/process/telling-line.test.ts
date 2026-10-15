import { describe, expect, it } from "vitest";
import { tellingLine } from "../../../src/core/process/telling-line.js";

/** What `brew upgrade` printed on macOS 27 with Command Line Tools for macOS 26. */
const BREW_CLT_FAILURE = [
  "==> Upgrading symfony-cli/tap/symfony-cli",
  "  5.20.0 -> 5.22.1",
  "Error: Your Command Line Tools (CLT) does not support macOS 27.",
  "It is either outdated or was modified.",
  "Please update your Command Line Tools (CLT) or delete it if no updates are available.",
  "Update them from Software Update in System Settings.",
  "You should download the Command Line Tools for Xcode 27.0.",
].join("\n");

describe("tellingLine", () => {
  it("takes the line that says why, not the advice printed after it", () => {
    expect(tellingLine(BREW_CLT_FAILURE)).toBe(
      "Error: Your Command Line Tools (CLT) does not support macOS 27.",
    );
  });

  it.each([
    ["pip", "Collecting x\nERROR: Could not install packages due to an OSError: [Errno 13]\n", "ERROR: Could not install packages due to an OSError: [Errno 13]"],
    ["cargo", "   Compiling x v1.0.0\nerror[E0425]: cannot find value `y`\nerror: could not compile `x`\n", "error[E0425]: cannot find value `y`"],
    ["git", "Cloning into 'x'...\nfatal: unable to access 'https://example.test/x.git/'\n", "fatal: unable to access 'https://example.test/x.git/'"],
    ["npm", "npm error code EACCES\nnpm error syscall mkdir\n", "npm error code EACCES"],
    ["npm 9", "npm ERR! code E404\nnpm ERR! 404 Not Found\n", "npm ERR! code E404"],
    ["apt", "Reading package lists...\nE: Unable to locate package x\n", "E: Unable to locate package x"],
  ])("finds the first error line %s prints", (_tool, output, line) => {
    expect(tellingLine(output)).toBe(line);
  });

  it("falls back to the last line when no line opens on an error marker", () => {
    expect(tellingLine("Downloading…\nInstaller failed with exit code: 1603\n\n")).toBe(
      "Installer failed with exit code: 1603",
    );
  });

  it("does not take a sentence that merely contains the word", () => {
    expect(tellingLine("No error found in the manifest\nthe hash does not match\n")).toBe(
      "the hash does not match",
    );
  });

  it("drops escape sequences and control characters, and treats a bare CR as a line end", () => {
    expect(tellingLine("\u001b[31mError:\u001b[0m disk\u0007 full\r 50%\r")).toBe("Error: disk  full");
  });

  it("cuts a long line to one summary line, an ellipsis at its end", () => {
    const line = tellingLine(`Error: ${"x".repeat(400)}`);
    expect(line).toHaveLength(240);
    expect(line?.endsWith("x…")).toBe(true);
  });

  it("is undefined for output with no text", () => {
    expect(tellingLine("")).toBeUndefined();
    expect(tellingLine("\n \r\n\u001b[0m\n")).toBeUndefined();
  });
});
