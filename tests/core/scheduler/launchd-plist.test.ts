import { describe, expect, it } from "vitest";
import {
  buildLaunchdPlist,
  isDisabledInLaunchd,
  LAUNCHD_LABEL,
} from "../../../src/core/scheduler/artifacts/launchd-plist.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";

const command = {
  node: "/opt/homebrew/bin/node",
  entry: "/opt/homebrew/lib/node_modules/@charles_lindecker/gup/dist/cli.js",
  args: [TICK_COMMAND] as const,
};
const STDERR = "/Users/a/Library/Application Support/gup/scheduler/agent-stderr.log";

describe("buildLaunchdPlist", () => {
  it("renders the user agent", () => {
    expect(buildLaunchdPlist({ command, stderrPath: STDERR })).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
          '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        "<dict>",
        "  <key>Label</key><string>io.github.lindecker-charles.gup.scheduler</string>",
        "  <key>ProgramArguments</key>",
        "  <array>",
        "    <string>/opt/homebrew/bin/node</string>",
        "    <string>/opt/homebrew/lib/node_modules/@charles_lindecker/gup/dist/cli.js</string>",
        "    <string>__schedule-tick</string>",
        "  </array>",
        "  <key>StartInterval</key><integer>900</integer>",
        "  <key>RunAtLoad</key><false/>",
        "  <key>ProcessType</key><string>Background</string>",
        "  <key>StandardOutPath</key><string>/dev/null</string>",
        `  <key>StandardErrorPath</key><string>${STDERR}</string>`,
        "</dict>",
        "</plist>",
        "",
      ].join("\n"),
    );
  });

  it("escapes markup in the argv and paths", () => {
    const plist = buildLaunchdPlist({
      command: { ...command, entry: "/Users/a/</string><string>-e</string>/cli.js" },
      stderrPath: "/tmp/a&b",
    });
    expect(plist).toContain("<string>/Users/a/&lt;/string&gt;&lt;string&gt;-e&lt;/string&gt;/cli.js</string>");
    expect(plist).toContain("<string>/tmp/a&amp;b</string>");
    expect(plist.match(/<string>/g)).toHaveLength(7);
  });
});

describe("isDisabledInLaunchd", () => {
  it("reads both print-disabled formats", () => {
    const ventura = `disabled services = {\n\t"${LAUNCHD_LABEL}" => disabled\n}`;
    const monterey = `disabled services = {\n\t"${LAUNCHD_LABEL}" => true\n}`;
    expect(isDisabledInLaunchd(ventura)).toBe(true);
    expect(isDisabledInLaunchd(monterey)).toBe(true);
  });

  it("is false when enabled, absent, or only a similar label is disabled", () => {
    expect(isDisabledInLaunchd(`\t"${LAUNCHD_LABEL}" => enabled`)).toBe(false);
    expect(isDisabledInLaunchd(`\t"${LAUNCHD_LABEL}" => false`)).toBe(false);
    expect(isDisabledInLaunchd(`\t"${LAUNCHD_LABEL}.other" => disabled`)).toBe(false);
    expect(isDisabledInLaunchd("")).toBe(false);
  });
});
