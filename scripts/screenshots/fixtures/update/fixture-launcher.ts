import { inScreenLauncher } from "../../../../src/ui/app/in-screen-launcher.js";
import type { LauncherFactory } from "../../../../src/ui/app/update-launcher.js";
import { FIXTURE_PLATFORM } from "../machine.js";
import type { ScriptedRun } from "./scripted-run.js";

/** Where the trampoline would be: never started, only named in the pseudo-terminal's argv. */
const TRAMPOLINE = { script: "pty-exec.js", execArgv: [] } as const;

/**
 * The launcher `gup` installs for the menu (the embedded-terminal CLI
 * module): the real in-screen launcher — confirmation, run view, PTY sink,
 * results — with the embedded terminal available on `run`'s in-memory
 * pseudo-terminal, the pipeline replaced by `run`'s script, and the fixture
 * machine's platform (a UAC step, not sudo).
 */
export function fixtureLauncher(run: ScriptedRun): LauncherFactory {
  return inScreenLauncher({
    loadSupport: async () => ({ isAvailable: true, pty: run.pty, trampoline: TRAMPOLINE }),
    runUpdates: run.run,
    platform: FIXTURE_PLATFORM,
    clock: run.clock,
  });
}
