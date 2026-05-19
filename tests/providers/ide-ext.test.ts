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

import { CursorExtProvider } from "../../src/providers/ide/cursor-ext.js";
import { VsCodeExtProvider } from "../../src/providers/ide/vscode-ext.js";
import { VsCodiumExtProvider } from "../../src/providers/ide/vscodium-ext.js";
import { WindsurfExtProvider } from "../../src/providers/ide/windsurf-ext.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Spec {
  name: string;
  binary: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<unknown[]>;
    update(id: string): Promise<unknown>;
    updateAll(pkgs: unknown[]): Promise<unknown[]>;
  };
}

const specs: Spec[] = [
  { name: "CursorExtProvider", binary: "cursor", Ctor: CursorExtProvider },
  { name: "VsCodeExtProvider", binary: "code", Ctor: VsCodeExtProvider },
  { name: "VsCodiumExtProvider", binary: "codium", Ctor: VsCodiumExtProvider },
  { name: "WindsurfExtProvider", binary: "windsurf", Ctor: WindsurfExtProvider },
];

for (const spec of specs) {
  describe(spec.name, () => {
    it("isAvailable delegates to commandExists with the right binary", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      const p = new spec.Ctor();
      await expect(p.isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);
    });

    it("isAvailable returns false when commandExists returns false", async () => {
      commandExistsMock.mockResolvedValueOnce(false);
      const p = new spec.Ctor();
      await expect(p.isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when CLI fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      const p = new spec.Ctor();
      await expect(p.listOutdated()).resolves.toEqual([]);
      expect(runMock).toHaveBeenCalledWith(spec.binary, [
        "--list-extensions",
        "--show-versions",
      ]);
    });

    it("listOutdated returns a row when CLI lists an outdated extension", async () => {
      runMock.mockResolvedValueOnce(mkRun("foo.bar@1.0.0\n"));
      // VsCodium uses Open VSX (GET); the others use Microsoft Marketplace (POST).
      if (spec.binary === "codium") {
        fetchMock.mockResolvedValueOnce(jsonResponse({ version: "2.0.0" }));
      } else {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({
            results: [{ extensions: [{ versions: [{ version: "2.0.0" }] }] }],
          }),
        );
      }
      const p = new spec.Ctor();
      const out = await p.listOutdated();
      expect(out).toEqual([
        { id: "foo.bar", name: "foo.bar", current: "1.0.0", latest: "2.0.0" },
      ]);
    });

    it("update returns success=true on runInherit success", async () => {
      runInheritMock.mockResolvedValueOnce(mkRun(""));
      const p = new spec.Ctor();
      await expect(p.update("foo.bar")).resolves.toEqual({
        id: "foo.bar",
        success: true,
      });
      expect(runInheritMock).toHaveBeenCalledWith(spec.binary, [
        "--install-extension",
        "foo.bar",
        "--force",
      ]);
    });

    it("update returns success=false on runInherit failure", async () => {
      runInheritMock.mockResolvedValueOnce(mkRun("", true));
      const p = new spec.Ctor();
      await expect(p.update("foo.bar")).resolves.toEqual({
        id: "foo.bar",
        success: false,
      });
    });

    it("updateAll returns [] when given no packages", async () => {
      const p = new spec.Ctor();
      await expect(p.updateAll([])).resolves.toEqual([]);
      expect(runInheritMock).not.toHaveBeenCalled();
    });

    it("updateAll iterates and aggregates outcomes", async () => {
      runInheritMock
        .mockResolvedValueOnce(mkRun(""))
        .mockResolvedValueOnce(mkRun("", true));
      const p = new spec.Ctor();
      const outcomes = await p.updateAll([
        { id: "a.a", current: "1", latest: "2" } as never,
        { id: "b.b", current: "1", latest: "2" } as never,
      ]);
      expect(outcomes).toEqual([
        { id: "a.a", success: true },
        { id: "b.b", success: false },
      ]);
    });
  });
}
