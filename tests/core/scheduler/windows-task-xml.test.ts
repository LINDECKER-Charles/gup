import { describe, expect, it } from "vitest";
import {
  buildWindowsTaskXml,
  windowsTaskAction,
  type WindowsTaskSpec,
} from "../../../src/core/scheduler/artifacts/windows-task-xml.js";
import { TICK_COMMAND } from "../../../src/core/scheduler/trigger/task-command.js";

const SID = "S-1-5-21-2795933949-5486597-2117879500-1001";

function spec(overrides: Partial<WindowsTaskSpec["registration"]> = {}): WindowsTaskSpec {
  return {
    userSid: SID,
    systemRoot: "C:\\Windows",
    registration: {
      command: {
        node: "C:\\Program Files\\nodejs\\node.exe",
        entry: "C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js",
        args: [TICK_COMMAND],
      },
      launcher: "headless",
      ...overrides,
    },
  };
}

const EXPECTED_HEADLESS = [
  '<?xml version="1.0" encoding="UTF-16"?>',
  '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
  "  <RegistrationInfo>",
  "    <Author>gup</Author>",
  "    <Description>gup : mises à jour planifiées. Vérifie toutes les 15 min si une " +
    "planification est due. Gérer : gup schedule.</Description>",
  "  </RegistrationInfo>",
  "  <Triggers>",
  "    <TimeTrigger>",
  "      <StartBoundary>2026-01-01T00:00:00</StartBoundary>",
  "      <Repetition>",
  "        <Interval>PT15M</Interval>",
  "        <StopAtDurationEnd>false</StopAtDurationEnd>",
  "      </Repetition>",
  "      <Enabled>true</Enabled>",
  "    </TimeTrigger>",
  "  </Triggers>",
  "  <Principals>",
  '    <Principal id="Author">',
  `      <UserId>${SID}</UserId>`,
  "      <LogonType>InteractiveToken</LogonType>",
  "      <RunLevel>LeastPrivilege</RunLevel>",
  "    </Principal>",
  "  </Principals>",
  "  <Settings>",
  "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
  "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
  "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
  "    <StartWhenAvailable>true</StartWhenAvailable>",
  "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>",
  "    <AllowStartOnDemand>true</AllowStartOnDemand>",
  "    <Enabled>true</Enabled>",
  "    <WakeToRun>false</WakeToRun>",
  "    <ExecutionTimeLimit>PT3H</ExecutionTimeLimit>",
  "    <Priority>7</Priority>",
  "  </Settings>",
  '  <Actions Context="Author">',
  "    <Exec>",
  "      <Command>C:\\Windows\\System32\\conhost.exe</Command>",
  '      <Arguments>--headless &quot;C:\\Program Files\\nodejs\\node.exe&quot; ' +
    "&quot;C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js" +
    "&quot; __schedule-tick</Arguments>",
  "    </Exec>",
  "  </Actions>",
  "</Task>",
  "",
].join("\r\n");

describe("buildWindowsTaskXml", () => {
  it("renders the headless task definition", () => {
    expect(buildWindowsTaskXml(spec())).toBe(EXPECTED_HEADLESS);
  });

  it("starts node.exe itself with the direct launcher", () => {
    expect(windowsTaskAction(spec({ launcher: "direct" }))).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      arguments:
        '"C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@charles_lindecker\\gup\\dist\\cli.js" ' +
        "__schedule-tick",
    });
  });

  it("escapes markup in every text node", () => {
    const xml = buildWindowsTaskXml({
      ...spec(),
      registration: {
        ...spec().registration,
        command: { ...spec().registration.command, entry: "C:\\a<b>&c\\cli.js" },
      },
    });
    expect(xml).toContain("&quot;C:\\a&lt;b&gt;&amp;c\\cli.js&quot;");
    expect(xml).not.toContain("<b>");
  });

  it.each([
    ['C:\\Users\\a"b\\cli.js'],
    ["C:\\Users\\%USERNAME%\\cli.js"],
    ["C:\\Users\\a\nb\\cli.js"],
  ])("refuses a path Task Scheduler would re-interpret: %j", (entry) => {
    const hostile = {
      ...spec(),
      registration: { ...spec().registration, command: { ...spec().registration.command, entry } },
    };
    expect(() => buildWindowsTaskXml(hostile)).toThrow("chemin non planifiable");
  });

  it("refuses anything but a SID as the principal", () => {
    expect(() => buildWindowsTaskXml({ ...spec(), userSid: "Everyone" })).toThrow("SID");
  });
});
