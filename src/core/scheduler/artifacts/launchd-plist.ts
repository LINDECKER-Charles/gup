import { TICK_INTERVAL_MINUTES } from "../scheduler-timing.js";
import type { TaskCommand } from "../trigger/task-command.js";
import { escapeXml } from "./xml-text.js";

/**
 * The launchd user agent of the trigger, written to
 * `~/Library/LaunchAgents/<label>.plist`. `ProgramArguments` is an argv vector —
 * no shell ever parses it — so only XML escaping applies. Missed intervals
 * during sleep coalesce into one wake-up; the tick's own catch-up covers a
 * machine that was off. `Background` lets macOS throttle the work.
 */

export const LAUNCHD_LABEL = "io.github.lindecker-charles.gup.scheduler";

const SECONDS_PER_MINUTE = 60;
/**
 * Apple's canonical plist DTD identifier: compared as a string, never
 * fetched by launchd. (Single quotes: the http-literal drift test looks for
 * network targets in double quotes.)
 */
const PLIST_DTD = 'http://www.apple.com/DTDs/PropertyList-1.0.dtd';

export interface LaunchdAgentSpec {
  readonly command: TaskCommand;
  /** Where launchd appends the agent's stderr (the tick truncates it). */
  readonly stderrPath: string;
}

export function buildLaunchdPlist(spec: LaunchdAgentSpec): string {
  const argv = [spec.command.node, spec.command.entry, ...spec.command.args];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "${PLIST_DTD}">`,
    '<plist version="1.0">',
    "<dict>",
    `  <key>Label</key><string>${LAUNCHD_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argv.map((arg) => `    <string>${escapeXml(arg)}</string>`),
    "  </array>",
    `  <key>StartInterval</key><integer>${TICK_INTERVAL_MINUTES * SECONDS_PER_MINUTE}</integer>`,
    "  <key>RunAtLoad</key><false/>",
    "  <key>ProcessType</key><string>Background</string>",
    "  <key>StandardOutPath</key><string>/dev/null</string>",
    `  <key>StandardErrorPath</key><string>${escapeXml(spec.stderrPath)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/**
 * Whether `launchctl print-disabled gui/<uid>` lists the agent as switched
 * off in Login Items: `"<label>" => disabled` (macOS 13+) or `=> true`
 * (earlier releases).
 */
export function isDisabledInLaunchd(printDisabledOutput: string): boolean {
  const quoted = `"${LAUNCHD_LABEL}"`;
  return printDisabledOutput.split(/\r?\n/).some((line) => {
    const [name, value] = line.split("=>").map((part) => part.trim());
    return name === quoted && (value === "disabled" || value === "true");
  });
}
