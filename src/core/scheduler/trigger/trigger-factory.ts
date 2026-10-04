import { localize } from "../../i18n/localized.js";
import { platformName } from "../../platform/platform-label.js";
import { CrontabTrigger } from "./crontab-trigger.js";
import { LaunchdTrigger } from "./launchd-agent.js";
import type { OsTrigger, TriggerRunner } from "./os-trigger.js";
import { WindowsTaskTrigger } from "./windows-task.js";

/**
 * The OS trigger of a platform: Task Scheduler on Windows, a launchd user
 * agent on macOS, the user's crontab on Linux. Other platforms (the BSDs)
 * are not supported in this version.
 */

export interface TriggerContext {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** POSIX uid (the launchd domain); undefined on Windows. */
  readonly uid: number | undefined;
  /** Where launchd appends the agent's stderr. */
  readonly agentStderr: string;
  readonly run?: TriggerRunner;
}

const DEFAULT_SYSTEM_ROOT = "C:\\Windows";
/** A drive-rooted path without the characters Task Scheduler would re-interpret. */
const SYSTEM_ROOT = /^[A-Za-z]:\\[^"%]+$/;

/** The platform's trigger, or why there is none. */
export type TriggerChoice = OsTrigger | { readonly unsupported: string };

export function osTriggerFor(context: TriggerContext): TriggerChoice {
  const run = context.run !== undefined ? { run: context.run } : {};
  switch (context.platform) {
    case "win32":
      return new WindowsTaskTrigger({ systemRoot: systemRootOf(context.env), ...run });
    case "darwin":
      if (context.uid === undefined) return unsupported(context.platform);
      return new LaunchdTrigger({
        home: context.home,
        uid: context.uid,
        stderrPath: context.agentStderr,
        ...run,
      });
    case "linux":
      return new CrontabTrigger(run);
    default:
      return unsupported(context.platform);
  }
}

/** `%SystemRoot%` when it is a plain drive path, else `C:\Windows`: never a planted value. */
export function systemRootOf(env: NodeJS.ProcessEnv): string {
  const value = env["SystemRoot"] ?? env["SYSTEMROOT"];
  return value !== undefined && SYSTEM_ROOT.test(value) ? value : DEFAULT_SYSTEM_ROOT;
}

function unsupported(platform: NodeJS.Platform): { readonly unsupported: string } {
  const name = platformName(platform);
  return {
    unsupported: localize({
      en: `scheduling is not supported on ${name}`,
      fr: `planification non prise en charge sous ${name}`,
    }),
  };
}
