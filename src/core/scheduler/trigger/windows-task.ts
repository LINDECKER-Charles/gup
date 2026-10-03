import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import type { RunResult } from "../../runner.js";
import { buildWindowsTaskXml } from "../artifacts/windows-task-xml.js";
import {
  DEFAULT_TRIGGER_RUNNER,
  firstLineOf,
  type OsTrigger,
  type TriggerRegistration,
  type TriggerRunner,
  type TriggerStatus,
} from "./os-trigger.js";

/**
 * The trigger as a Task Scheduler task of the current user, named
 * `gup-scheduler-<SID>` (tasks share one namespace per machine). Every
 * binary is called by absolute path under `%SystemRoot%\System32`, so a
 * planted `schtasks.exe` on PATH is never run. `schtasks` speaks the
 * machine's language (`Erreur : …` here): only exit codes are interpreted.
 */

export const WINDOWS_TASK_PREFIX = "gup-scheduler-";

export interface WindowsTaskOptions {
  /** `%SystemRoot%`, already validated. */
  readonly systemRoot: string;
  readonly run?: TriggerRunner;
  /** Fixed task name instead of the per-user one (the integration test's `gup-it-*`). */
  readonly taskName?: string;
}

const SID_IN_CSV = /"(S-1-[0-9-]+)"\s*$/m;
const UTF16_BOM = Buffer.from([0xff, 0xfe]);

export class WindowsTaskTrigger implements OsTrigger {
  readonly mechanism = "windows-task";
  readonly #options: WindowsTaskOptions;
  readonly #run: TriggerRunner;
  #userSid: string | null = null;

  constructor(options: WindowsTaskOptions) {
    this.#options = options;
    this.#run = options.run ?? DEFAULT_TRIGGER_RUNNER;
  }

  async install(registration: TriggerRegistration): Promise<void> {
    const { systemRoot } = this.#options;
    const xml = buildWindowsTaskXml({ userSid: await this.#sid(), registration, systemRoot });
    const name = await this.location();
    await withTaskFile(xml, async (file) => {
      const result = await this.#schtasks(["/Create", "/TN", name, "/XML", file, "/F"]);
      if (result.failed) throw schtasksError("/Create", result);
    });
  }

  async uninstall(): Promise<void> {
    const result = await this.#schtasks(["/Delete", "/TN", await this.location(), "/F"]);
    if (result.failed && (await this.status()).isInstalled) throw schtasksError("/Delete", result);
  }

  async status(): Promise<TriggerStatus> {
    try {
      const result = await this.#schtasks(["/Query", "/TN", await this.location()]);
      return { isInstalled: !result.failed, isDisabledByUser: false };
    } catch {
      return { isInstalled: false, isDisabledByUser: false };
    }
  }

  async location(): Promise<string> {
    return this.#options.taskName ?? `${WINDOWS_TASK_PREFIX}${await this.#sid()}`;
  }

  #schtasks(args: string[]): Promise<RunResult> {
    return this.#run(this.#system32("schtasks.exe"), args);
  }

  #system32(binary: string): string {
    return win32.join(this.#options.systemRoot, "System32", binary);
  }

  /** The user's SID, from `whoami /user` in its non-localised CSV form; cached once found. */
  async #sid(): Promise<string> {
    if (this.#userSid !== null) return this.#userSid;
    const result = await this.#run(this.#system32("whoami.exe"), ["/user", "/fo", "csv", "/nh"]);
    const sid = SID_IN_CSV.exec(result.stdout)?.[1];
    if (result.failed || !sid) throw new Error("SID de l'utilisateur introuvable (whoami)");
    this.#userSid = sid;
    return sid;
  }
}

function schtasksError(verb: string, result: RunResult): Error {
  return new Error(`schtasks ${verb} a échoué (code ${result.exitCode}) : ${firstLineOf(result)}`);
}

/**
 * Task Scheduler reads the definition from a file: UTF-16LE with a BOM, in
 * a private `mkdtemp` directory, created with `wx`, removed afterwards.
 */
async function withTaskFile(xml: string, use: (file: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "gup-task-"));
  try {
    const file = join(dir, "task.xml");
    writeFileSync(file, Buffer.concat([UTF16_BOM, Buffer.from(xml, "utf16le")]), { flag: "wx" });
    await use(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
