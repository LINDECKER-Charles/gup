import { describe, expect, it, vi } from "vitest";
import {
  openerFor,
  openExternal,
  type Launch,
  type OpenerFacts,
} from "../../../src/core/export/open-external.js";

/**
 * Every platform is decided from injected facts, so Windows, macOS, Linux and
 * WSL are all checked from any machine. The launcher is always a mock: a unit
 * test never starts a browser (W2-4).
 */

const NO_LAUNCHERS = { xdgOpen: null, wslview: null };

function facts(over: Partial<OpenerFacts>): OpenerFacts {
  return { platform: "linux", env: {}, launchers: NO_LAUNCHERS, ...over };
}

describe("openerFor", () => {
  it("opens with explorer.exe by its absolute path under SystemRoot on Windows", () => {
    const file = "C:\\Users\\me\\AppData\\Local\\gup\\reports\\gup-report-20261003-142205.html";

    expect(openerFor(file, facts({ platform: "win32", env: { SystemRoot: "D:\\WINDOWS" } }))).toEqual({
      command: "D:\\WINDOWS\\explorer.exe",
      args: [file],
    });
  });

  it("falls back to C:\\Windows when SystemRoot is missing or not absolute", () => {
    const file = "C:\\r\\report.html";

    for (const env of [{}, { SystemRoot: "WINDOWS" }]) {
      expect(openerFor(file, facts({ platform: "win32", env }))).toEqual({
        command: "C:\\Windows\\explorer.exe",
        args: [file],
      });
    }
  });

  it.each([
    ["a relative path", "reports\\report.html"],
    ["a comma, which explorer reads as a separator", "C:\\Users\\Doe, Jane\\report.html"],
    ["a quote", 'C:\\r\\"report".html'],
  ])("refuses %s on Windows", (_case, file) => {
    expect(openerFor(file, facts({ platform: "win32", env: { SystemRoot: "C:\\Windows" } }))).toEqual({
      reason: expect.any(String),
    });
  });

  it("opens with /usr/bin/open on macOS", () => {
    expect(openerFor("/Users/me/report.html", facts({ platform: "darwin" }))).toEqual({
      command: "/usr/bin/open",
      args: ["/Users/me/report.html"],
    });
  });

  it("opens with xdg-open on Linux", () => {
    const launchers = { xdgOpen: "/usr/bin/xdg-open", wslview: null };

    expect(openerFor("/home/me/report.html", facts({ launchers }))).toEqual({
      command: "/usr/bin/xdg-open",
      args: ["/home/me/report.html"],
    });
  });

  it("prefers wslview under WSL, where xdg-open may fall back to a text browser", () => {
    const launchers = { xdgOpen: "/usr/bin/xdg-open", wslview: "/usr/bin/wslview" };
    const wsl = facts({ env: { WSL_DISTRO_NAME: "Ubuntu" }, launchers });

    expect(openerFor("/home/me/report.html", wsl)).toEqual({
      command: "/usr/bin/wslview",
      args: ["/home/me/report.html"],
    });
    expect(openerFor("/home/me/report.html", { ...wsl, launchers: { ...launchers, wslview: null } })).toEqual({
      command: "/usr/bin/xdg-open",
      args: ["/home/me/report.html"],
    });
  });

  it("says why when there is nothing to open with, or the path is relative", () => {
    expect(openerFor("/home/me/report.html", facts({}))).toEqual({ reason: expect.stringContaining("xdg-open") });
    expect(openerFor("report.html", facts({ platform: "darwin" }))).toEqual({ reason: "not an absolute path" });
  });
});

describe("openExternal", () => {
  it("starts the launcher detached and reports it opened", async () => {
    const launch = vi.fn<Launch>(async () => true);

    const result = await openExternal("/Users/me/report.html", { platform: "darwin", env: {}, launch });

    expect(result).toEqual({ opened: true, launcher: "/usr/bin/open" });
    expect(launch).toHaveBeenCalledWith("/usr/bin/open", ["/Users/me/report.html"]);
  });

  it("searches PATH for the Linux launchers only where they are needed", async () => {
    const which = vi.fn(async (command: string) => (command === "xdg-open" ? "/usr/bin/xdg-open" : null));
    const launch = vi.fn<Launch>(async () => true);

    await openExternal("/home/me/r.html", { platform: "linux", env: {}, which, launch });
    await openExternal("C:\\r\\r.html", { platform: "win32", env: {}, which, launch });

    expect(which.mock.calls.map(([command]) => command)).toEqual(["xdg-open"]);
    expect(launch).toHaveBeenLastCalledWith("C:\\Windows\\explorer.exe", ["C:\\r\\r.html"]);
  });

  it.each([
    ["does not start", vi.fn<Launch>(async () => false)],
    ["is refused by the runner's argv barrier", vi.fn<Launch>(() => Promise.reject(new Error("runner: refusing")))],
    [
      "throws synchronously",
      vi.fn<Launch>(() => {
        throw new Error("boom");
      }),
    ],
  ])("never throws when the launcher %s", async (_case, launch) => {
    const result = await openExternal("/Users/me/r.html", { platform: "darwin", env: {}, launch });

    expect(result).toMatchObject({ opened: false, launcher: "/usr/bin/open", reason: expect.any(String) });
  });

  it("does not launch anything when no launcher fits", async () => {
    const launch = vi.fn<Launch>(async () => true);

    const result = await openExternal("/home/me/r.html", {
      platform: "linux",
      env: {},
      which: async () => null,
      launch,
    });

    expect(result).toMatchObject({ opened: false, launcher: null });
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("openExternal: an HTML page only", () => {
  it.each([
    ["an HTML application, which mshta runs", "win32", "C:\\Users\\user\\rapport.hta"],
    ["an executable", "win32", "C:\\Users\\user\\rapport.exe"],
    ["a name whose last extension is not HTML", "win32", "C:\\Users\\user\\rapport.html.hta"],
    ["a name with no extension", "win32", "C:\\Users\\user\\rapport"],
    ["a Terminal script, which macOS runs", "darwin", "/Users/user/rapport.command"],
    ["a desktop entry, which xdg-open may run", "linux", "/home/user/rapport.desktop"],
  ] as const)("never hands %s to the default application", async (_case, platform, file) => {
    const launch = vi.fn<Launch>(async () => true);
    const which = vi.fn(async () => "/usr/bin/xdg-open");

    const result = await openExternal(file, { platform, env: {}, which, launch });

    expect(result).toEqual({ opened: false, launcher: null, reason: "not an HTML file", isNotHtml: true });
    expect(launch).not.toHaveBeenCalled();
    expect(which).not.toHaveBeenCalled();
  });

  it.each([
    ["win32", "C:\\Users\\user\\RAPPORT.HTML"],
    ["win32", "C:\\Users\\user\\rapport.htm"],
    ["darwin", "/Users/user/rapport.Html"],
  ] as const)("opens an HTML page whatever the case of its extension (%s, %s)", async (platform, file) => {
    const launch = vi.fn<Launch>(async () => true);

    expect(await openExternal(file, { platform, env: {}, launch })).toMatchObject({ opened: true });
  });

  it("refuses an NTFS stream named like a page: x.hta:y.html is a stream of x.hta", async () => {
    const launch = vi.fn<Launch>(async () => true);

    const result = await openExternal("C:\\Users\\user\\x.hta:y.html", { platform: "win32", env: {}, launch });

    expect(result).toMatchObject({ opened: false, reason: expect.stringContaining("stream") });
    expect(launch).not.toHaveBeenCalled();
    // The colon of a long path's drive is part of its root, not a stream.
    expect(openerFor("\\\\?\\C:\\Users\\user\\rapport.html", facts({ platform: "win32" }))).toMatchObject({
      args: ["\\\\?\\C:\\Users\\user\\rapport.html"],
    });
  });
});
