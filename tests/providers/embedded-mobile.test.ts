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

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: vi.fn(),
  normalizeVersion: (v: string) => v.trim().replace(/^v/i, "").toLowerCase(),
}));

import { AndroidSdkProvider } from "../../src/providers/embedded-mobile/android-sdk.js";
import { ArduinoCliProvider } from "../../src/providers/embedded-mobile/arduino-cli.js";
import { ExpoProvider } from "../../src/providers/embedded-mobile/expo.js";
import { FastlaneProvider } from "../../src/providers/embedded-mobile/fastlane.js";
import { PlatformIoProvider } from "../../src/providers/embedded-mobile/platformio.js";

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
  fetchGitHubReleaseLatestMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AndroidSdkProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new AndroidSdkProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new AndroidSdkProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when sdkmanager --list fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new AndroidSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when 'Available Updates:' section is missing", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "Installed packages:\nplatform-tools | 34.0.0\n\nAvailable Packages:\n",
      ),
    );
    await expect(new AndroidSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses rows, skipping headers/separators and short lines", async () => {
    const output = [
      "Some unrelated banner",
      "",
      "Available Updates:",
      "Id | Installed | Available",
      "------- | ------- | -------",
      "platform-tools | 33.0.0 | 34.0.0",
      "incomplete-line-without-pipes",
      "build-tools | 33.0.1 | 34.0.0",
      "",
      "Trailing content after blank line that should be ignored",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(output));

    const rows = await new AndroidSdkProvider().listOutdated();
    expect(rows).toEqual([
      { id: "platform-tools", name: "platform-tools", current: "33.0.0", latest: "34.0.0" },
      { id: "build-tools", name: "build-tools", current: "33.0.1", latest: "34.0.0" },
    ]);
  });

  it("listOutdated skips rows with empty columns", async () => {
    const output = [
      "Available Updates:",
      "Id | Installed | Available",
      "platform-tools |  | 34.0.0",
      " | 33.0.0 | 34.0.0",
      "platform-tools | 33.0.0 | ",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(output));
    await expect(new AndroidSdkProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated reads to EOF when no trailing blank line follows the section", async () => {
    const output = [
      "Available Updates:",
      "Id | Installed | Available",
      "platform-tools | 33.0.0 | 34.0.0",
    ].join("\n");
    runMock.mockResolvedValueOnce(mkRun(output));

    const rows = await new AndroidSdkProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("platform-tools");
  });

  it("update invokes sdkmanager --install <pkg>", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AndroidSdkProvider().update("platform-tools");
    expect(res).toEqual({ id: "platform-tools", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("sdkmanager", [
      "--install",
      "platform-tools",
    ]);
  });

  it("update returns failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new AndroidSdkProvider().update("platform-tools");
    expect(res).toEqual({ id: "platform-tools", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new AndroidSdkProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs sdkmanager --update once and maps outcomes per package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AndroidSdkProvider().updateAll([
      { id: "platform-tools", current: "33", latest: "34" },
      { id: "build-tools", current: "33", latest: "34" },
    ]);
    expect(res).toEqual([
      { id: "platform-tools", success: true },
      { id: "build-tools", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("sdkmanager", ["--update"]);
  });

  it("updateAll propagates failure to every outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new AndroidSdkProvider().updateAll([
      { id: "platform-tools", current: "33", latest: "34" },
    ]);
    expect(res).toEqual([{ id: "platform-tools", success: false }]);
  });
});

describe("ArduinoCliProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ArduinoCliProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ArduinoCliProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails and outdated probe fails", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated swallows invalid version JSON", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("not json"))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips when VersionString is missing", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(JSON.stringify({})))
      .mockResolvedValueOnce(mkRun("", true));
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated skips when latest GH release is null", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(JSON.stringify({ VersionString: "0.34.0" })))
      .mockResolvedValueOnce(mkRun("", true));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips when latest equals current", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(JSON.stringify({ VersionString: "0.34.0" })))
      .mockResolvedValueOnce(mkRun("", true));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.34.0");
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits CLI row when newer release exists", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(JSON.stringify({ VersionString: "0.34.0" })))
      .mockResolvedValueOnce(mkRun("", true));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.35.0");

    const rows = await new ArduinoCliProvider().listOutdated();
    expect(rows).toEqual([
      { id: "arduino-cli", name: "Arduino CLI", current: "0.34.0", latest: "0.35.0" },
    ]);
  });

  it("listOutdated swallows outdated JSON parse errors", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun("not json"));
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips outdated when stdout is whitespace-only", async () => {
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun("   \n  "));
    await expect(new ArduinoCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits platform rows, skipping incomplete or up-to-date entries", async () => {
    const outdatedJson = {
      Platforms: [
        { ID: "arduino:avr", Installed: "1.8.5", Latest: "1.8.6" },
        { ID: "esp32:esp32", Installed: "2.0.10", Latest: "2.0.10" },
        { Installed: "1.0.0", Latest: "1.1.0" },
        { ID: "missing-installed", Latest: "1.1.0" },
        { ID: "missing-latest", Installed: "1.0.0" },
      ],
    };
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun(JSON.stringify(outdatedJson)));

    const rows = await new ArduinoCliProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "platform:arduino:avr",
        name: "arduino:avr",
        current: "1.8.5",
        latest: "1.8.6",
        note: "platform",
      },
    ]);
  });

  it("listOutdated emits library rows, skipping incomplete or up-to-date entries", async () => {
    const outdatedJson = {
      Libraries: [
        {
          Library: { Name: "Servo", Version: "1.2.0" },
          Release: { Version: "1.2.1" },
        },
        {
          Library: { Name: "Wire", Version: "1.0.0" },
          Release: { Version: "1.0.0" },
        },
        { Library: { Name: "OnlyName" }, Release: { Version: "1.0.0" } },
        { Library: { Name: "NoRelease", Version: "1.0.0" } },
        { Release: { Version: "1.0.0" } },
      ],
    };
    runMock
      .mockResolvedValueOnce(mkRun("", true))
      .mockResolvedValueOnce(mkRun(JSON.stringify(outdatedJson)));

    const rows = await new ArduinoCliProvider().listOutdated();
    expect(rows).toEqual([
      {
        id: "lib:Servo",
        name: "Servo",
        current: "1.2.0",
        latest: "1.2.1",
        note: "library",
      },
    ]);
  });

  it("listOutdated returns CLI + platforms + libs concatenated", async () => {
    runMock
      .mockResolvedValueOnce(mkRun(JSON.stringify({ VersionString: "0.34.0" })))
      .mockResolvedValueOnce(
        mkRun(
          JSON.stringify({
            Platforms: [{ ID: "x:y", Installed: "1", Latest: "2" }],
            Libraries: [
              {
                Library: { Name: "L", Version: "1" },
                Release: { Version: "2" },
              },
            ],
          }),
        ),
      );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.35.0");

    const rows = await new ArduinoCliProvider().listOutdated();
    expect(rows.map((r) => r.id)).toEqual([
      "arduino-cli",
      "platform:x:y",
      "lib:L",
    ]);
  });

  it("update for arduino-cli delegates to `arduino-cli upgrade`", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ArduinoCliProvider().update("arduino-cli");
    expect(res).toEqual({ id: "arduino-cli", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("arduino-cli", ["upgrade"]);
  });

  it("update for arduino-cli reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ArduinoCliProvider().update("arduino-cli");
    expect(res).toEqual({ id: "arduino-cli", success: false });
  });

  it("update for platform:* invokes core upgrade <id>", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ArduinoCliProvider().update("platform:arduino:avr");
    expect(res).toEqual({ id: "platform:arduino:avr", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("arduino-cli", [
      "core",
      "upgrade",
      "arduino:avr",
    ]);
  });

  it("update for lib:* invokes lib upgrade <id>", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ArduinoCliProvider().update("lib:Servo");
    expect(res).toEqual({ id: "lib:Servo", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("arduino-cli", [
      "lib",
      "upgrade",
      "Servo",
    ]);
  });

  it("update returns 'id inconnu' for an unknown prefix", async () => {
    const res = await new ArduinoCliProvider().update("weird:foo");
    expect(res).toEqual({
      id: "weird:foo",
      success: false,
      message: "id inconnu",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new ArduinoCliProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs arduino-cli upgrade once and maps outcomes per package", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ArduinoCliProvider().updateAll([
      { id: "platform:a", current: "1", latest: "2" },
      { id: "lib:Servo", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([
      { id: "platform:a", success: true },
      { id: "lib:Servo", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledWith("arduino-cli", ["upgrade"]);
  });

  it("updateAll propagates failure to every outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ArduinoCliProvider().updateAll([
      { id: "arduino-cli", current: "1", latest: "2" },
    ]);
    expect(res).toEqual([{ id: "arduino-cli", success: false }]);
  });
});

describe("ExpoProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ExpoProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ExpoProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when `expo --version` fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when stdout has no parsable version", async () => {
    runMock.mockResolvedValueOnce(mkRun("not-a-version"));
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when registry fetch is not ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("v51.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when registry json has no dist-tags.latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("51.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ "dist-tags": {} }));
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("51.0.0"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("51.0.0"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ "dist-tags": { latest: "51.0.0" } }),
    );
    await expect(new ExpoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("51.0.0"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ "dist-tags": { latest: "52.0.0" } }),
    );
    const rows = await new ExpoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "expo", name: "Expo CLI", current: "51.0.0", latest: "52.0.0" },
    ]);
  });

  it("update invokes npm install -g expo@latest", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ExpoProvider().update("expo");
    expect(res).toEqual({ id: "expo", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("npm", [
      "install",
      "-g",
      "expo@latest",
    ]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new ExpoProvider().update("expo");
    expect(res).toEqual({ id: "expo", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new ExpoProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new ExpoProvider().updateAll([
      { id: "expo", current: "51", latest: "52" },
    ]);
    expect(res).toEqual([{ id: "expo", success: true }]);
  });
});

describe("FastlaneProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new FastlaneProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new FastlaneProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when fastlane --version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no fastlane line is parsable", async () => {
    runMock.mockResolvedValueOnce(mkRun("bundler 2.5.0\nrubygems 3.5.0"));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when rubygems fetch is not ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("fastlane 2.220.0\nplugin x 1.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when rubygems json lacks version", async () => {
    runMock.mockResolvedValueOnce(mkRun("fastlane 2.220.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("fastlane 2.220.0"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("fastlane 2.220.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "2.220.0" }));
    await expect(new FastlaneProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ (and strips a leading v)", async () => {
    runMock.mockResolvedValueOnce(mkRun("fastlane v2.220.0\nplugin foo 1.0.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "2.221.0" }));

    const rows = await new FastlaneProvider().listOutdated();
    expect(rows).toEqual([
      { id: "fastlane", name: "Fastlane", current: "2.220.0", latest: "2.221.0" },
    ]);
  });

  it("update invokes gem update fastlane", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FastlaneProvider().update("fastlane");
    expect(res).toEqual({ id: "fastlane", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("gem", ["update", "fastlane"]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new FastlaneProvider().update("fastlane");
    expect(res).toEqual({ id: "fastlane", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new FastlaneProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FastlaneProvider().updateAll([
      { id: "fastlane", current: "2.220.0", latest: "2.221.0" },
    ]);
    expect(res).toEqual([{ id: "fastlane", success: true }]);
  });
});

describe("PlatformIoProvider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new PlatformIoProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new PlatformIoProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when pio --version fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("Unknown banner output"));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when pypi fetch is not ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("PlatformIO Core, version 6.1.15"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when pypi json has no info.version", async () => {
    runMock.mockResolvedValueOnce(mkRun("PlatformIO Core, version 6.1.15"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("PlatformIO Core, version 6.1.15"));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("PlatformIO Core, version 6.1.15"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "6.1.15" } }));
    await expect(new PlatformIoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("PlatformIO Core, version v6.1.15"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "6.1.16" } }));

    const rows = await new PlatformIoProvider().listOutdated();
    expect(rows).toEqual([
      { id: "platformio", name: "PlatformIO Core", current: "6.1.15", latest: "6.1.16" },
    ]);
  });

  it("update invokes pio upgrade", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PlatformIoProvider().update("platformio");
    expect(res).toEqual({ id: "platformio", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("pio", ["upgrade"]);
  });

  it("update reports failure on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new PlatformIoProvider().update("platformio");
    expect(res).toEqual({ id: "platformio", success: false });
  });

  it("updateAll returns [] when no packages", async () => {
    await expect(new PlatformIoProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new PlatformIoProvider().updateAll([
      { id: "platformio", current: "6.1.15", latest: "6.1.16" },
    ]);
    expect(res).toEqual([{ id: "platformio", success: true }]);
  });
});
