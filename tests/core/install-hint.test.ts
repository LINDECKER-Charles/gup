import { afterEach, describe, expect, it } from "vitest";

import { pickInstallHint } from "../../src/core/install-hint.js";

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
});

describe("pickInstallHint", () => {
  const hints = {
    win32: "winget install Kubernetes.kubectl",
    darwin: "brew install kubernetes-cli",
    linux: "sudo apt install kubectl",
    fallback: "https://kubernetes.io/releases/download/",
  };

  it("returns the win32 hint on Windows", () => {
    setPlatform("win32");
    expect(pickInstallHint(hints)).toBe("winget install Kubernetes.kubectl");
  });

  it("returns the darwin hint on macOS", () => {
    setPlatform("darwin");
    expect(pickInstallHint(hints)).toBe("brew install kubernetes-cli");
  });

  it("returns the linux hint on Linux", () => {
    setPlatform("linux");
    expect(pickInstallHint(hints)).toBe("sudo apt install kubectl");
  });

  it("falls back on a platform nobody enumerated", () => {
    setPlatform("freebsd");
    expect(pickInstallHint(hints)).toBe("https://kubernetes.io/releases/download/");
  });

  it("falls back per-platform when that platform has no dedicated entry", () => {
    // The common shape in this repo: a Windows-specific hint plus a Homebrew
    // fallback that serves macOS and Linuxbrew alike.
    const brewish = { win32: "winget install X", fallback: "brew install x" };
    setPlatform("darwin");
    expect(pickInstallHint(brewish)).toBe("brew install x");
    setPlatform("linux");
    expect(pickInstallHint(brewish)).toBe("brew install x");
    setPlatform("win32");
    expect(pickInstallHint(brewish)).toBe("winget install X");
  });
});
