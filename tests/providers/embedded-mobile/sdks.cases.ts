import { AndroidSdkProvider } from "../../../src/providers/embedded-mobile/android-sdk.js";
import { ArduinoCliProvider } from "../../../src/providers/embedded-mobile/arduino-cli.js";
import { ExpoProvider } from "../../../src/providers/embedded-mobile/expo.js";
import { FastlaneProvider } from "../../../src/providers/embedded-mobile/fastlane.js";
import { PlatformIoProvider } from "../../../src/providers/embedded-mobile/platformio.js";
import {
  nothingListedOn,
  type SelfUpdatingTool,
  selfUpdatingToolCases,
} from "../../support/contract/self-updating-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import { githubLatest, pypiRoute } from "../../support/system/releases.js";
import type { CommandAnswer, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Mobile and embedded SDKs and tools: the Android SDK's packages, Arduino's
 * CLI with its cores and libraries, and three tools versioned against their
 * language registry (Expo on npm, fastlane on RubyGems, PlatformIO on PyPI).
 * The machines a knowledge test starts from are exported.
 */

// --- Android SDK ----------------------------------------------------------------------

export const SDKMANAGER_LIST = ["sdkmanager", "--list"];

/** sdkmanager on PATH printing `stdout` for `--list`. */
export function sdkManagerMachine(stdout: string): SystemSpec {
  return {
    platform: "linux",
    bin: { sdkmanager: "/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager" },
    commands: [{ argv: SDKMANAGER_LIST, stdout }],
  };
}

/** `sdkmanager --list`: installed packages, then the updates section gup reads, then the rest. */
const SDK_LIST = [
  "Installed packages:",
  "  Path            | Version | Description | Location",
  "  -------         | ------- | -------     | -------",
  "  platform-tools  | 33.0.0  | Android SDK Platform-Tools | platform-tools",
  "",
  "Available Updates:",
  "  ID             | Installed | Available",
  "  -------        | -------   | -------",
  "  platform-tools | 33.0.0    | 34.0.0",
  "  incomplete-line-without-pipes",
  "  build-tools    | 33.0.1    | 34.0.0",
  "",
  "Available Packages:",
  "  emulator | 34.1.9 | Android Emulator",
].join("\n");

/** One row per package; `sdkmanager --update` upgrades them all at once. */
const ANDROID_SDK: ProviderContractCase = {
  create: () => new AndroidSdkProvider(),
  system: sdkManagerMachine(SDK_LIST),
  outdated: [
    { id: "platform-tools", name: "platform-tools", current: "33.0.0", latest: "34.0.0" },
    { id: "build-tools", name: "build-tools", current: "33.0.1", latest: "34.0.0" },
  ],
  update: { packageId: "platform-tools", installs: [["sdkmanager", "--install", "platform-tools"]] },
  updateAll: "one-batch",
  batchInstalls: [["sdkmanager", "--update"]],
};

// --- Arduino CLI ----------------------------------------------------------------------

export const ARDUINO_VERSION = ["arduino-cli", "version", "--format", "json"];
export const ARDUINO_OUTDATED = ["arduino-cli", "outdated", "--format", "json"];
export const ARDUINO_RELEASE = githubLatest("arduino/arduino-cli", "v0.35.0");

export interface ArduinoMachine {
  readonly version: CommandAnswer;
  readonly outdated: CommandAnswer;
  readonly http?: readonly HttpRoute[];
}

/** arduino-cli on PATH, its version and outdated reports answering as given. */
export function arduinoMachine(machine: ArduinoMachine): SystemSpec {
  return {
    platform: "win32",
    bin: { "arduino-cli": `${WIN_HOME}\\AppData\\Local\\Programs\\Arduino CLI\\arduino-cli.exe` },
    commands: [
      { argv: ARDUINO_VERSION, ...machine.version },
      { argv: ARDUINO_OUTDATED, ...machine.outdated },
    ],
    http: machine.http ?? [ARDUINO_RELEASE],
  };
}

export const arduinoVersion = (version: string): CommandAnswer => ({
  stdout: JSON.stringify({ Application: "arduino-cli", VersionString: version, Commit: "1a2b3c4" }),
});

/** The CLI itself, a core and a library behind; entries already current or incomplete left out. */
const ARDUINO_CLI: ProviderContractCase = {
  create: () => new ArduinoCliProvider(),
  system: arduinoMachine({
    version: arduinoVersion("0.34.0"),
    outdated: {
      stdout: JSON.stringify({
        Platforms: [
          { ID: "arduino:avr", Installed: "1.8.5", Latest: "1.8.6" },
          { ID: "esp32:esp32", Installed: "2.0.10", Latest: "2.0.10" },
        ],
        Libraries: [
          { Library: { Name: "Servo", Version: "1.2.0" }, Release: { Version: "1.2.1" } },
          { Library: { Name: "Wire", Version: "1.0.0" }, Release: { Version: "1.0.0" } },
        ],
      }),
    },
  }),
  outdated: [
    { id: "arduino-cli", name: "Arduino CLI", current: "0.34.0", latest: "0.35.0" },
    { id: "platform:arduino:avr", name: "arduino:avr", current: "1.8.5", latest: "1.8.6", note: "platform" },
    { id: "lib:Servo", name: "Servo", current: "1.2.0", latest: "1.2.1", note: "library" },
  ],
  update: {
    packageId: "platform:arduino:avr",
    installs: [["arduino-cli", "core", "upgrade", "arduino:avr"]],
  },
  // `arduino-cli upgrade` upgrades every core and library at once.
  updateAll: "one-batch",
  batchInstalls: [["arduino-cli", "upgrade"]],
};

// --- registry-versioned tools -----------------------------------------------------------

/** The npm packument, abbreviated: what `fetchNpmLatest` reads. */
function npmPackument(latest?: string): HttpRoute {
  return {
    url: "https://registry.npmjs.org/expo",
    json: { name: "expo", "dist-tags": latest ? { latest } : {} },
  };
}

const EXPO: SelfUpdatingTool = {
  create: () => new ExpoProvider(),
  system: {
    platform: "win32",
    bin: { expo: `${WIN_HOME}\\AppData\\Roaming\\npm\\expo.cmd` },
    commands: [{ argv: ["expo", "--version"], stdout: "51.0.0" }],
  },
  release: npmPackument("52.0.0"),
  row: { id: "expo", name: "Expo CLI", current: "51.0.0", latest: "52.0.0" },
  upToDate: npmPackument("51.0.0"),
  installs: [["npm", "install", "-g", "expo@latest"]],
};

/** `GET https://rubygems.org/api/v1/versions/fastlane/latest.json` → `{ version }`. */
export function rubygemsLatest(version?: string): HttpRoute {
  return {
    url: "https://rubygems.org/api/v1/versions/fastlane/latest.json",
    json: version ? { version } : {},
  };
}

export const FASTLANE_VERSION = ["fastlane", "--version"];

/** fastlane prints where it is installed before its version line. */
export function fastlaneMachine(stdout: string): SystemSpec {
  return {
    platform: "darwin",
    bin: { fastlane: "/opt/homebrew/lib/ruby/gems/3.3.0/bin/fastlane" },
    commands: [{ argv: FASTLANE_VERSION, stdout }],
  };
}

const FASTLANE: SelfUpdatingTool = {
  create: () => new FastlaneProvider(),
  system: fastlaneMachine(
    "fastlane installation at path:\n" +
      "/opt/homebrew/lib/ruby/gems/3.3.0/gems/fastlane-2.220.0/bin/fastlane\n" +
      "-----------------------------\n" +
      "fastlane 2.220.0",
  ),
  release: rubygemsLatest("2.221.0"),
  row: { id: "fastlane", name: "Fastlane", current: "2.220.0", latest: "2.221.0" },
  upToDate: rubygemsLatest("2.220.0"),
  installs: [["gem", "update", "fastlane"]],
};

const PLATFORMIO: SelfUpdatingTool = {
  create: () => new PlatformIoProvider(),
  system: {
    platform: "linux",
    bin: { pio: "/home/u/.platformio/penv/bin/pio" },
    commands: [{ argv: ["pio", "--version"], stdout: "PlatformIO Core, version 6.1.15" }],
  },
  release: pypiRoute("platformio", "6.1.16"),
  row: { id: "platformio", name: "PlatformIO Core", current: "6.1.15", latest: "6.1.16" },
  upToDate: pypiRoute("platformio", "6.1.15"),
  installs: [["pio", "upgrade"]],
};

export const sdksCases: readonly ProviderContractCase[] = [
  ANDROID_SDK,
  ARDUINO_CLI,
  ...selfUpdatingToolCases(EXPO),
  nothingListedOn(EXPO, "registry without a latest tag", npmPackument()),
  ...selfUpdatingToolCases(FASTLANE),
  nothingListedOn(FASTLANE, "RubyGems without a version", rubygemsLatest()),
  ...selfUpdatingToolCases(PLATFORMIO),
  nothingListedOn(PLATFORMIO, "PyPI without a version", pypiRoute("platformio")),
];
