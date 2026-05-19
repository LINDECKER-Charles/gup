import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
}));

import { CargoProvider } from "../../src/providers/rust/cargo.js";
import { RustupProvider } from "../../src/providers/rust/rustup.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- cargo */
describe("CargoProvider", () => {
  it("isAvailable false when cargo missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new CargoProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable false when cargo-update plugin probe fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new CargoProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable true when plugin probe succeeds", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("cargo-install-update 12.0.0"));
    await expect(new CargoProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when header line missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage\nmore garbage"));
    await expect(new CargoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips empty lines, separator lines, too-short rows, up-to-date and non-version lines", async () => {
    // Source destructure: `const [name, , current, latest] = parts;`
    // It reads parts[0], skips parts[1], then parts[2] = current, parts[3] = latest.
    // Anything past index 3 is ignored (trailing columns are fine).
    const stdout = [
      "Package      Installed  Latest   Needs update",
      "----         ---------  ------   ------------",
      "",
      "tooshort row",
      "---- another separator inside the body ----",
      "ripgrep      skip       14.0.0   14.0.0   No",
      "fd-find      skip       v8.0.0   v9.0.0   Yes",
      "weird-name   skip       1.2.3    notaversion Yes",
      "good         skip       1.2.3    2.0.0    Yes",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(stdout));
    const rows = await new CargoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "fd-find", name: "fd-find", current: "v8.0.0", latest: "v9.0.0" },
      { id: "good", name: "good", current: "1.2.3", latest: "2.0.0" },
    ]);
  });

  it("update runs `cargo install-update <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CargoProvider().update("ripgrep");
    expect(res).toEqual({ id: "ripgrep", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("cargo", [
      "install-update",
      "ripgrep",
    ]);
  });

  it("update reports failure", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new CargoProvider().update("ripgrep");
    expect(res).toEqual({ id: "ripgrep", success: false });
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new CargoProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs `cargo install-update -a` and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new CargoProvider().updateAll([
      { id: "ripgrep", current: "1", latest: "2" } as never,
      { id: "fd", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "ripgrep", success: true },
      { id: "fd", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("cargo", ["install-update", "-a"]);
  });
});

/* --------------------------------------------------------------- rustup */
describe("RustupProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new RustupProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new RustupProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated [] on probe failure", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new RustupProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses Update available lines and skips Up to date lines", async () => {
    // Note: the parser's "tail" regex `[^->]*` stops at '-' or '>', so the
    // (abcdef nightly-build) suffix must not contain a dash before the arrow.
    const stdout = [
      "stable-x86_64-pc-windows-msvc - Update available : 1.79.0 (abcdef 20240101) -> 1.80.0 (123456 20240202)",
      "nightly-x86_64-pc-windows-msvc - Up to date : 1.81.0",
      "rustup - Update available : 1.27.1 -> 1.28.0",
      "",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(stdout));
    const rows = await new RustupProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "stable-x86_64-pc-windows-msvc",
        name: "stable-x86_64-pc-windows-msvc",
        current: "1.79.0",
        latest: "1.80.0",
      },
      { id: "rustup", name: "rustup", current: "1.27.1", latest: "1.28.0" },
    ]);
  });

  it("update with packageId 'rustup' runs `rustup self update`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new RustupProvider().update("rustup");
    expect(res).toEqual({ id: "rustup", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("rustup", ["self", "update"]);
  });

  it("update with other id runs `rustup update <id>`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new RustupProvider().update("stable");
    expect(res).toEqual({ id: "stable", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("rustup", ["update", "stable"]);
  });

  it("updateAll [] short-circuits", async () => {
    await expect(new RustupProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll runs `rustup update` once and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new RustupProvider().updateAll([
      { id: "stable", current: "1", latest: "2" } as never,
      { id: "nightly", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "stable", success: true },
      { id: "nightly", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("rustup", ["update"]);
  });
});
