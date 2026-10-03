import { Window } from "happy-dom";
import { afterAll, describe, expect, it } from "vitest";
import { cronLine } from "../../../src/core/scheduler/artifacts/crontab-block.js";
import {
  buildLaunchdPlist,
  LAUNCHD_LABEL,
} from "../../../src/core/scheduler/artifacts/launchd-plist.js";
import { buildWindowsTaskXml } from "../../../src/core/scheduler/artifacts/windows-task-xml.js";
import { CronExpression } from "../../../src/core/scheduler/model/cron.js";
import { TICK_COMMAND, type TaskCommand } from "../../../src/core/scheduler/trigger/task-command.js";

/**
 * The OS artefacts read back by a parser, not compared as strings: the plist
 * and the task definition are well-formed XML whose text nodes decode to
 * the exact paths registered, and the crontab line is five schedule fields
 * then a command /bin/sh splits into exactly the registered argv — for
 * ordinary paths and for paths full of markup and shell syntax.
 */

const window = new Window();
const parser = new window.DOMParser();

afterAll(async () => {
  await window.happyDOM.close();
});

type ParsedXml = ReturnType<typeof parser.parseFromString>;

function parseXml(text: string): ParsedXml {
  const document = parser.parseFromString(text, "application/xml");
  expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
  return document;
}

const texts = (document: ParsedXml, tag: string): string[] =>
  [...document.getElementsByTagName(tag)].map((element) => element.textContent);

const command = (node: string, entry: string): TaskCommand => ({
  node,
  entry,
  args: [TICK_COMMAND],
});

describe("the launchd plist", () => {
  it.each([
    "/opt/homebrew/lib/node_modules/@charles_lindecker/gup/dist/cli.js",
    "/Users/a/</string><string>-e</string>/cli.js",
    "/Users/a/Tom & Jerry's \"tools\"/cli.js",
    "/Users/a/$(curl evil)/`id`/cli.js",
  ])("is a well-formed agent whose argv decodes to the registered paths: %j", (entry) => {
    const stderrPath = "/Users/a/Library/Application Support/gup/a&b <c>.log";
    const plist = parseXml(buildLaunchdPlist({ command: command("/opt/node", entry), stderrPath }));
    const root = plist.documentElement;
    expect([root.tagName, root.getAttribute("version")]).toEqual(["plist", "1.0"]);
    const dict = [...(root.firstElementChild?.children ?? [])];
    const entries = new Map(
      dict.flatMap((element, index) =>
        element.tagName === "key" ? [[element.textContent, dict[index + 1]] as const] : [],
      ),
    );
    expect(entries.get("Label")?.textContent).toBe(LAUNCHD_LABEL);
    expect(plist.getElementsByTagName("array")).toHaveLength(1);
    const argv = [...(entries.get("ProgramArguments")?.children ?? [])];
    expect(argv.map((element) => element.textContent)).toEqual(["/opt/node", entry, TICK_COMMAND]);
    expect(entries.get("StartInterval")?.textContent).toBe("900");
    expect(entries.get("RunAtLoad")?.tagName).toBe("false");
    expect(entries.get("StandardErrorPath")?.textContent).toBe(stderrPath);
  });
});

/** CommandLineToArgvW for arguments that never hold a quote (refused) nor end in `\`. */
function windowsArgv(commandLine: string): string[] {
  return [...commandLine.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

describe("the Task Scheduler definition", () => {
  it.each([
    "C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js",
    "C:\\Users\\Tom & Jerry's\\a</Arguments><Command>evil.exe</Command>\\cli.js",
  ])("is well-formed and starts node with exactly the registered argv: %j", (entry) => {
    const node = "C:\\Program Files\\nodejs\\node.exe";
    const xml = buildWindowsTaskXml({
      userSid: "S-1-5-21-1-2-3-1001",
      systemRoot: "C:\\Windows",
      registration: { command: command(node, entry), launcher: "headless" },
    });
    const task = parseXml(xml);
    expect(task.documentElement.tagName).toBe("Task");
    expect(texts(task, "Command")).toEqual(["C:\\Windows\\System32\\conhost.exe"]);
    const [commandLine = ""] = texts(task, "Arguments");
    expect(windowsArgv(commandLine)).toEqual(["--headless", node, entry, TICK_COMMAND]);
    expect(texts(task, "UserId")).toEqual(["S-1-5-21-1-2-3-1001"]);
  });
});

/** How /bin/sh splits a command made of single-quoted and bare words. */
function shellWords(commandLine: string): string[] {
  return [...commandLine.matchAll(/'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

describe("the crontab line", () => {
  it.each([
    "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js",
    "/home/a/my tools/$(curl evil)/`id`/\"x\"&y;z/cli.js",
  ])("is five schedule fields, then the registered argv for /bin/sh: %j", (entry) => {
    const line = cronLine(command("/usr/bin/node", entry));
    const fields = line.split(" ");
    const schedule = fields.slice(0, 5).join(" ");
    const parsed = CronExpression.tryParse(schedule);
    if (!parsed.ok) throw new Error(parsed.reason);
    const from = new Date("2026-10-05T10:07:00Z");
    expect(parsed.cron.nextRuns(from, 2).map((at) => at.toISOString())).toEqual([
      "2026-10-05T10:15:00.000Z",
      "2026-10-05T10:30:00.000Z",
    ]);
    const words = shellWords(line.slice(schedule.length + 1));
    expect(words).toEqual(["/usr/bin/node", entry, TICK_COMMAND, ">/dev/null", "2>&1"]);
    // cron turns an unescaped % into a line break: none may reach the line.
    expect(line).not.toContain("%");
  });
});
