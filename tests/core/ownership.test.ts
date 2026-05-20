import { describe, expect, it } from "vitest";
import {
  filterByOwnership,
  inferBinaryOwnerFromPath,
  type BinaryOwner,
} from "../../src/core/ownership.js";
import type { ProviderScanResult } from "../../src/core/types.js";

describe("inferBinaryOwnerFromPath", () => {
  it("recognizes nvm-windows install roots (Windows-specific)", () => {
    expect(inferBinaryOwnerFromPath("C:\\ProgramData\\nvm\\v22.21.1\\node.exe")).toBe(
      "nvm-windows",
    );
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\AppData\\Roaming\\nvm4w\\v20\\node.exe")).toBe(
      "nvm-windows",
    );
  });

  it("recognizes POSIX nvm separately from nvm-windows", () => {
    // POSIX nvm is a distinct project; we surface it as the dedicated "nvm"
    // owner so the exclusion advisory reads correctly across platforms.
    expect(inferBinaryOwnerFromPath("/home/me/.nvm/versions/node/v20/bin/node")).toBe("nvm");
  });

  it("recognizes fnm, volta, mise, pyenv-win, asdf, proto roots", () => {
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\AppData\\Local\\fnm\\node.exe")).toBe("fnm");
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\AppData\\Local\\fnm-multishells\\node.exe")).toBe(
      "fnm",
    );
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\.volta\\bin\\node.exe")).toBe("volta");
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\AppData\\Local\\mise\\shims\\python.exe")).toBe(
      "mise",
    );
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\.pyenv-win\\shims\\python.bat")).toBe(
      "pyenv-win",
    );
    expect(inferBinaryOwnerFromPath("/home/me/.asdf/shims/python")).toBe("asdf");
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\.proto\\bin\\node.exe")).toBe("proto");
  });

  it("defers to install-source for scoop/choco/winget paths", () => {
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\scoop\\apps\\nodejs\\current\\node.exe")).toBe(
      "scoop",
    );
    expect(
      inferBinaryOwnerFromPath("C:\\ProgramData\\chocolatey\\bin\\node.exe"),
    ).toBe("choco");
    expect(
      inferBinaryOwnerFromPath("C:\\Users\\me\\AppData\\Local\\Programs\\nodejs\\node.exe"),
    ).toBe("winget");
  });

  it("recognizes uv installed under ~/.cargo/bin on both POSIX and Windows", () => {
    expect(inferBinaryOwnerFromPath("/home/me/.cargo/bin/uv")).toBe("uv");
    expect(inferBinaryOwnerFromPath("C:\\Users\\me\\.cargo\\bin\\uv.exe")).toBe("uv");
  });

  it("returns 'manual' for unrecognized paths", () => {
    expect(inferBinaryOwnerFromPath("C:\\custom\\bin\\node.exe")).toBe("manual");
    expect(inferBinaryOwnerFromPath("/opt/local/bin/node")).toBe("manual");
  });
});

describe("filterByOwnership", () => {
  const mkScan = (
    providerId: string,
    pkgIds: string[],
  ): ProviderScanResult => ({
    providerId,
    available: true,
    packages: pkgIds.map((id) => ({ id, current: "1.0.0", latest: "2.0.0" })),
  });

  it("drops choco:nodejs when nvm-windows owns `node` on PATH", async () => {
    const fakeDetect = async (binary: string): Promise<BinaryOwner> =>
      binary === "node" ? "nvm-windows" : "manual";
    const { results, exclusions } = await filterByOwnership(
      [mkScan("choco", ["nodejs", "nodejs.install", "fzf"])],
      fakeDetect,
    );
    expect(results[0]!.packages.map((p) => p.id)).toEqual(["fzf"]);
    expect(exclusions).toHaveLength(2);
    expect(exclusions[0]).toEqual({
      providerId: "choco",
      packageId: "nodejs",
      binary: "node",
      actualOwner: "nvm-windows",
    });
  });

  it("keeps choco:nodejs when choco itself owns `node`", async () => {
    const fakeDetect = async (): Promise<BinaryOwner> => "choco";
    const { results, exclusions } = await filterByOwnership(
      [mkScan("choco", ["nodejs"])],
      fakeDetect,
    );
    expect(results[0]!.packages).toHaveLength(1);
    expect(exclusions).toEqual([]);
  });

  it("keeps polyglot packages when the binary is not on PATH (owner = manual)", async () => {
    // Defensive: an absent binary is no evidence of conflict — we don't have
    // enough information to claim ownership, so we keep the package.
    const fakeDetect = async (): Promise<BinaryOwner> => "manual";
    const { results, exclusions } = await filterByOwnership(
      [mkScan("choco", ["python", "python3"])],
      fakeDetect,
    );
    expect(results[0]!.packages).toHaveLength(2);
    expect(exclusions).toEqual([]);
  });

  it("ignores packages not in the polyglot ownership table", async () => {
    // `caddy` is not a polyglot binary — never queried, never dropped.
    let calls = 0;
    const fakeDetect = async (): Promise<BinaryOwner> => {
      calls++;
      return "manual";
    };
    const { results, exclusions } = await filterByOwnership(
      [mkScan("choco", ["caddy", "ffmpeg"])],
      fakeDetect,
    );
    expect(results[0]!.packages).toHaveLength(2);
    expect(exclusions).toEqual([]);
    expect(calls).toBe(0);
  });

  it("passes through providers with no entry in the polyglot table", async () => {
    const fakeDetect = async (): Promise<BinaryOwner> => "manual";
    const scan = mkScan("npm-global", ["typescript", "vite"]);
    const { results, exclusions } = await filterByOwnership([scan], fakeDetect);
    expect(results[0]).toEqual(scan);
    expect(exclusions).toEqual([]);
  });

  it("handles winget IDs and reports the actual owner per exclusion", async () => {
    const fakeDetect = async (binary: string): Promise<BinaryOwner> =>
      binary === "node" ? "fnm" : binary === "python" ? "pyenv-win" : "manual";
    const { results, exclusions } = await filterByOwnership(
      [mkScan("winget", ["OpenJS.NodeJS", "Python.Python.3.12", "Microsoft.VisualStudioCode"])],
      fakeDetect,
    );
    expect(results[0]!.packages.map((p) => p.id)).toEqual(["Microsoft.VisualStudioCode"]);
    expect(exclusions.map((e) => e.actualOwner)).toEqual(["fnm", "pyenv-win"]);
  });

  it("calls the detector at most once per distinct binary across packages", async () => {
    // choco's python / python3 / python311 / python312 / python313 / python314
    // all map to the same `python` binary. Without caching the default detector
    // would shell out to `where`/`which` six times per scan.
    const callsByBinary = new Map<string, number>();
    const fakeDetect = async (binary: string): Promise<BinaryOwner> => {
      callsByBinary.set(binary, (callsByBinary.get(binary) ?? 0) + 1);
      return "manual";
    };
    await filterByOwnership(
      [mkScan("choco", ["python", "python3", "python311", "python312", "python313", "python314"])],
      fakeDetect,
    );
    expect(callsByBinary.get("python")).toBe(1);
  });
});
