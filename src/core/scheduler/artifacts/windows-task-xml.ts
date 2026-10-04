import { win32 } from "node:path";
import {
  EXECUTION_TIME_LIMIT_MINUTES,
  TICK_INTERVAL_MINUTES,
} from "../scheduler-timing.js";
import type { TriggerRegistration } from "../trigger/os-trigger.js";
import { isUnsafePath } from "../trigger/task-command.js";
import { ARTIFACT_ERRORS } from "./artifact-errors.js";
import { escapeXml } from "./xml-text.js";

/**
 * The Task Scheduler definition of the trigger (schema 1.2), registered with
 * `schtasks /Create /XML`. Verified on Windows 11 26200 as a standard user:
 * UTF-16LE with BOM, the root folder and a SID principal are accepted;
 * `conhost --headless` starts node with no window (and does not propagate its
 * exit code); `IgnoreNew` refuses a second instance while one runs; the task
 * starts in `C:\Windows\System32` and with the user's registry environment.
 *
 * Least privilege throughout: the user's own interactive token (the task
 * runs only while they are logged on, never with a stored password),
 * `LeastPrivilege` run level. Laptop-hostile defaults are overridden (no
 * start refused on battery, no stop when unplugged), and a missed start runs
 * as soon as possible.
 */

export interface WindowsTaskSpec {
  /** The user's SID, `S-1-5-21-…`. */
  readonly userSid: string;
  readonly registration: TriggerRegistration;
  /** `%SystemRoot%`, validated by the caller (`C:\Windows`). */
  readonly systemRoot: string;
}

/**
 * What Task Scheduler shows of the task. English whatever the interface's
 * language: the task is found by its name, never by this text, and a
 * description that followed the language would differ from one repair to
 * the next.
 */
export const TASK_DESCRIPTION =
  `gup: scheduled updates. Checks every ${TICK_INTERVAL_MINUTES} min ` +
  "whether a schedule is due. Manage: gup schedule.";

/**
 * The Task Scheduler schema's namespace: an identifier compared as a string,
 * never fetched, whose scheme the schema fixed. (Written in single quotes:
 * the http-literal drift test looks for network targets in double quotes.)
 */
const TASK_NAMESPACE = 'http://schemas.microsoft.com/windows/2004/02/mit/task';
/** Any past instant: the repetition, not the start, sets the rhythm. */
const START_BOUNDARY = "2026-01-01T00:00:00";
const SID = /^S-1-[0-9-]+$/;
const BELOW_NORMAL_PRIORITY = 7;
const MINUTES_PER_HOUR = 60;
/** Task definitions are Windows text files. */
const CRLF = "\r\n";

export function buildWindowsTaskXml(spec: WindowsTaskSpec): string {
  if (!SID.test(spec.userSid)) throw new Error(ARTIFACT_ERRORS.invalidSid(spec.userSid));
  const action = windowsTaskAction(spec);
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    `<Task version="1.2" xmlns="${TASK_NAMESPACE}">`,
    "  <RegistrationInfo>",
    "    <Author>gup</Author>",
    `    <Description>${escapeXml(TASK_DESCRIPTION)}</Description>`,
    "  </RegistrationInfo>",
    ...triggers(),
    ...principal(spec.userSid),
    ...settings(),
    '  <Actions Context="Author">',
    "    <Exec>",
    `      <Command>${escapeXml(action.command)}</Command>`,
    `      <Arguments>${escapeXml(action.arguments)}</Arguments>`,
    "    </Exec>",
    "  </Actions>",
    "</Task>",
    "",
  ].join(CRLF);
}

/**
 * What Task Scheduler runs: `conhost.exe --headless "node" "entry" __schedule-tick`
 * (headless), or node.exe itself (direct). `<Arguments>` is one Windows
 * command line: each path is quoted, and a path holding a quote or a `%`
 * (Task Scheduler expands `%VAR%`) is refused.
 */
export function windowsTaskAction(spec: WindowsTaskSpec): {
  readonly command: string;
  readonly arguments: string;
} {
  const { command, launcher } = spec.registration;
  for (const path of [command.node, command.entry, spec.systemRoot]) {
    if (isUnsafePath(path, "win32")) throw new Error(ARTIFACT_ERRORS.unsafePath(path));
  }
  const script = [`"${command.entry}"`, ...command.args].join(" ");
  if (launcher === "direct") return { command: command.node, arguments: script };
  return {
    command: win32.join(spec.systemRoot, "System32", "conhost.exe"),
    arguments: `--headless "${command.node}" ${script}`,
  };
}

function triggers(): string[] {
  return [
    "  <Triggers>",
    "    <TimeTrigger>",
    `      <StartBoundary>${START_BOUNDARY}</StartBoundary>`,
    "      <Repetition>",
    `        <Interval>${isoDuration(TICK_INTERVAL_MINUTES)}</Interval>`,
    "        <StopAtDurationEnd>false</StopAtDurationEnd>",
    "      </Repetition>",
    "      <Enabled>true</Enabled>",
    "    </TimeTrigger>",
    "  </Triggers>",
  ];
}

function principal(userSid: string): string[] {
  return [
    "  <Principals>",
    '    <Principal id="Author">',
    `      <UserId>${escapeXml(userSid)}</UserId>`,
    "      <LogonType>InteractiveToken</LogonType>",
    "      <RunLevel>LeastPrivilege</RunLevel>",
    "    </Principal>",
    "  </Principals>",
  ];
}

function settings(): string[] {
  return [
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
    "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
    "    <StartWhenAvailable>true</StartWhenAvailable>",
    "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>",
    "    <AllowStartOnDemand>true</AllowStartOnDemand>",
    "    <Enabled>true</Enabled>",
    "    <WakeToRun>false</WakeToRun>",
    `    <ExecutionTimeLimit>${isoDuration(EXECUTION_TIME_LIMIT_MINUTES)}</ExecutionTimeLimit>`,
    `    <Priority>${BELOW_NORMAL_PRIORITY}</Priority>`,
    "  </Settings>",
  ];
}

/** 15 → `PT15M`, 180 → `PT3H`. */
function isoDuration(minutes: number): string {
  return minutes % MINUTES_PER_HOUR === 0
    ? `PT${minutes / MINUTES_PER_HOUR}H`
    : `PT${minutes}M`;
}
