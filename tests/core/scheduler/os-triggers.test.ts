import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRON_BLOCK_BEGIN } from "../../../src/core/scheduler/artifacts/crontab-block.js";
import { LAUNCHD_LABEL } from "../../../src/core/scheduler/artifacts/launchd-plist.js";
import {
  CRONTAB_MISSING,
  CrontabTrigger,
} from "../../../src/core/scheduler/trigger/crontab-trigger.js";
import {
  LaunchdTrigger,
  type AgentFiles,
} from "../../../src/core/scheduler/trigger/launchd-agent.js";
import type {
  TriggerRegistration,
  TriggerRunner,
  TriggerRunOptions,
} from "../../../src/core/scheduler/trigger/os-trigger.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";
import {
  osTriggerFor,
  systemRootOf,
} from "../../../src/core/scheduler/trigger/trigger-factory.js";
import { WindowsTaskTrigger } from "../../../src/core/scheduler/trigger/windows-task.js";
import type { RunResult } from "../../../src/core/runner.js";

interface Call {
  readonly command: string;
  readonly args: readonly string[];
  readonly options?: TriggerRunOptions;
}

type Answer = Partial<RunResult> | ((call: Call) => Partial<RunResult>);

/** A runner answering by `command args…` prefix; unscripted calls succeed silently. */
function fakeRunner(answers: Readonly<Record<string, Answer>> = {}) {
  const calls: Call[] = [];
  const run: TriggerRunner = async (command, args, options) => {
    const call = { command, args, ...(options && { options }) };
    calls.push(call);
    const line = [command, ...args].join(" ");
    const key = Object.keys(answers).find((prefix) => line.startsWith(prefix));
    const answer = key === undefined ? {} : answers[key];
    const result = typeof answer === "function" ? answer(call) : (answer ?? {});
    return { stdout: "", stderr: "", exitCode: 0, failed: false, ...result };
  };
  return { run, calls };
}

const FAILED = { exitCode: 1, failed: true };
const registration: TriggerRegistration = {
  command: { node: "/usr/bin/node", entry: "/usr/lib/gup/dist/cli.js", args: [TICK_COMMAND] },
  launcher: "headless",
};

describe("WindowsTaskTrigger", () => {
  const SCHTASKS = "C:\\Windows\\System32\\schtasks.exe";
  const WHOAMI_CSV = '"host\\a","S-1-5-21-1-2-3-1001"\r\n';
  const NAME = "gup-scheduler-S-1-5-21-1-2-3-1001";
  const windowsRegistration: TriggerRegistration = {
    command: {
      node: "C:\\Program Files\\nodejs\\node.exe",
      entry: "C:\\npm\\gup\\dist\\cli.js",
      args: [TICK_COMMAND],
    },
    launcher: "headless",
  };

  it("registers a per-user task from a UTF-16 XML file it removes afterwards", async () => {
    let xmlFile = "";
    let xml = "";
    const { run, calls } = fakeRunner({
      "C:\\Windows\\System32\\whoami.exe": { stdout: WHOAMI_CSV },
      [`${SCHTASKS} /Create`]: (call) => {
        xmlFile = call.args[4] ?? "";
        const bytes = readFileSync(xmlFile);
        expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
        xml = bytes.subarray(2).toString("utf16le");
        return {};
      },
    });
    await new WindowsTaskTrigger({ systemRoot: "C:\\Windows", run }).install(windowsRegistration);
    expect(calls.map((call) => [call.command, ...call.args])).toEqual([
      ["C:\\Windows\\System32\\whoami.exe", "/user", "/fo", "csv", "/nh"],
      [SCHTASKS, "/Create", "/TN", NAME, "/XML", xmlFile, "/F"],
    ]);
    expect(xml).toContain("<UserId>S-1-5-21-1-2-3-1001</UserId>");
    expect(xml).toContain("<Command>C:\\Windows\\System32\\conhost.exe</Command>");
    expect(existsSync(xmlFile)).toBe(false);
  });

  it("reports the task from the exit code of /Query only", async () => {
    const present = fakeRunner({ "C:\\Windows\\System32\\whoami.exe": { stdout: WHOAMI_CSV } });
    const absent = fakeRunner({
      "C:\\Windows\\System32\\whoami.exe": { stdout: WHOAMI_CSV },
      [`${SCHTASKS} /Query`]: { ...FAILED, stderr: "Erreur : Le fichier spécifié est introuvable." },
    });
    const at = (run: TriggerRunner) => new WindowsTaskTrigger({ systemRoot: "C:\\Windows", run });
    expect(await at(present.run).status()).toEqual({ isInstalled: true, isDisabledByUser: false });
    expect(await at(absent.run).status()).toEqual({ isInstalled: false, isDisabledByUser: false });
    expect(present.calls.at(-1)?.args).toEqual(["/Query", "/TN", NAME]);
  });

  it("deletes the task, and treats an already absent task as removed", async () => {
    const { run, calls } = fakeRunner({
      "C:\\Windows\\System32\\whoami.exe": { stdout: WHOAMI_CSV },
      [`${SCHTASKS} /Delete`]: FAILED,
      [`${SCHTASKS} /Query`]: FAILED,
    });
    await new WindowsTaskTrigger({ systemRoot: "C:\\Windows", run }).uninstall();
    expect(calls.map((call) => call.args[0])).toEqual(["/user", "/Delete", "/Query"]);
  });

  it("fails with schtasks' reason, and uses a fixed name when given one", async () => {
    const { run } = fakeRunner({
      "C:\\Windows\\System32\\whoami.exe": { stdout: WHOAMI_CSV },
      [`${SCHTASKS} /Create`]: { ...FAILED, stderr: "Accès refusé." },
    });
    const trigger = new WindowsTaskTrigger({
      systemRoot: "C:\\Windows",
      run,
      taskName: "gup-it-1",
    });
    await expect(trigger.install(windowsRegistration)).rejects.toThrow(
      "schtasks /Create a échoué (code 1) : Accès refusé.",
    );
    expect(await trigger.location()).toBe("gup-it-1");
  });
});

describe("LaunchdTrigger", () => {
  function memoryFiles(): AgentFiles & { readonly written: Map<string, string> } {
    const written = new Map<string, string>();
    return {
      written,
      write: (path, content) => void written.set(path, content),
      remove: (path) => void written.delete(path),
    };
  }
  const PLIST = `/Users/a/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`;
  const options = { home: "/Users/a", uid: 501, stderrPath: "/Users/a/err.log" };

  it("writes the plist, then boots the agent out, in, and enables it", async () => {
    const files = memoryFiles();
    const { run, calls } = fakeRunner({ "/bin/launchctl bootout": FAILED });
    await new LaunchdTrigger({ ...options, run, files }).install(registration);
    expect(files.written.get(PLIST)).toContain("<string>/usr/lib/gup/dist/cli.js</string>");
    expect(calls.map((call) => [call.command, ...call.args])).toEqual([
      ["/bin/launchctl", "bootout", `gui/501/${LAUNCHD_LABEL}`],
      ["/bin/launchctl", "bootstrap", "gui/501", PLIST],
      ["/bin/launchctl", "enable", `gui/501/${LAUNCHD_LABEL}`],
    ]);
  });

  it("fails when launchd refuses the agent", async () => {
    const { run } = fakeRunner({
      "/bin/launchctl bootstrap": { ...FAILED, stderr: "Bootstrap failed: 5" },
    });
    const trigger = new LaunchdTrigger({ ...options, run, files: memoryFiles() });
    await expect(trigger.install(registration)).rejects.toThrow("launchctl bootstrap a échoué");
  });

  it("reports an agent switched off in Login Items", async () => {
    const { run } = fakeRunner({
      "/bin/launchctl print-disabled": { stdout: `\t"${LAUNCHD_LABEL}" => disabled` },
    });
    const status = await new LaunchdTrigger({ ...options, run, files: memoryFiles() }).status();
    expect(status).toEqual({ isInstalled: true, isDisabledByUser: true });
  });

  it("boots out and deletes the plist on uninstall", async () => {
    const files = memoryFiles();
    files.write(PLIST, "<plist/>");
    const { run, calls } = fakeRunner();
    await new LaunchdTrigger({ ...options, run, files }).uninstall();
    expect(files.written.has(PLIST)).toBe(false);
    expect(calls.map((call) => call.args[0])).toEqual(["bootout"]);
  });
});

describe("CrontabTrigger", () => {
  const locate = async () => "/usr/bin/crontab";
  const foreign = "0 3 * * * /usr/local/bin/backup\n";

  it("reads under LC_ALL=C and writes the whole crontab back on stdin", async () => {
    const { run, calls } = fakeRunner({ "/usr/bin/crontab -l": { stdout: foreign.trimEnd() } });
    await new CrontabTrigger({ run, locate }).install(registration);
    expect(calls.map((call) => call.args)).toEqual([["-l"], ["-"]]);
    expect(calls[0]?.options).toEqual({ env: { LC_ALL: "C" } });
    const written = calls[1]?.options?.input ?? "";
    expect(written.startsWith(foreign)).toBe(true);
    expect(written).toContain(CRON_BLOCK_BEGIN);
    expect(written.endsWith("\n")).toBe(true);
  });

  it("treats 'no crontab for' as empty", async () => {
    const { run, calls } = fakeRunner({
      "/usr/bin/crontab -l": { ...FAILED, stderr: "no crontab for a" },
    });
    await new CrontabTrigger({ run, locate }).install(registration);
    expect(calls[1]?.options?.input?.startsWith(CRON_BLOCK_BEGIN)).toBe(true);
  });

  it("never overwrites a crontab it could not read", async () => {
    const { run, calls } = fakeRunner({
      "/usr/bin/crontab -l": { ...FAILED, stderr: "crontab: Permission denied" },
    });
    const trigger = new CrontabTrigger({ run, locate });
    await expect(trigger.install(registration)).rejects.toThrow("Permission denied");
    await expect(trigger.uninstall()).rejects.toThrow("Permission denied");
    expect(calls.filter((call) => call.args[0] === "-")).toEqual([]);
    expect(await trigger.status()).toEqual({ isInstalled: false, isDisabledByUser: false });
  });

  it("removes only its block, and writes nothing when there is none", async () => {
    const installed = fakeRunner();
    await new CrontabTrigger({ run: installed.run, locate }).install(registration);
    const withBlock = foreign + (installed.calls[1]?.options?.input ?? "");
    const { run, calls } = fakeRunner({ "/usr/bin/crontab -l": { stdout: withBlock } });
    await new CrontabTrigger({ run, locate }).uninstall();
    expect(calls[1]?.options?.input).toBe(foreign);
    const clean = fakeRunner({ "/usr/bin/crontab -l": { stdout: foreign } });
    await new CrontabTrigger({ run: clean.run, locate }).uninstall();
    expect(clean.calls).toHaveLength(1);
  });

  it("explains a missing crontab binary", async () => {
    const trigger = new CrontabTrigger({ run: fakeRunner().run, locate: async () => null });
    await expect(trigger.install(registration)).rejects.toThrow(CRONTAB_MISSING);
  });
});

describe("osTriggerFor", () => {
  const base = { env: {}, home: "/home/a", uid: 1000, agentStderr: "/tmp/err.log" };

  it("picks the mechanism of each platform", () => {
    const mechanism = (platform: NodeJS.Platform) => {
      const choice = osTriggerFor({ ...base, platform });
      return "mechanism" in choice ? choice.mechanism : choice.unsupported;
    };
    expect(mechanism("win32")).toBe("windows-task");
    expect(mechanism("darwin")).toBe("launchd");
    expect(mechanism("linux")).toBe("crontab");
    expect(mechanism("freebsd")).toBe("planification non prise en charge sous freebsd");
  });

  it("only trusts a plain drive path as %SystemRoot%", () => {
    expect(systemRootOf({ SystemRoot: "D:\\Win" })).toBe("D:\\Win");
    expect(systemRootOf({ SystemRoot: "C:\\%EVIL%" })).toBe("C:\\Windows");
    expect(systemRootOf({ SystemRoot: "\\\\server\\share" })).toBe("C:\\Windows");
    expect(systemRootOf({})).toBe("C:\\Windows");
  });
});
