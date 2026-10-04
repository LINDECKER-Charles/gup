import { DEFAULT_LOCALE, setActiveLocale } from "./core/i18n/locale.js";
import { writeExitFile } from "./core/pty/exit-file.js";
import { PTY_LABELS } from "./core/pty/pty-labels.js";
import { decodePayload, type TrampolinePayload } from "./core/pty/trampoline-payload.js";
import { runInherit, type RunResult } from "./core/runner.js";

/**
 * The trampoline: the program node-pty starts in the embedded terminal, as
 * `node pty-exec.js <base64url request>` (second bundle, so an install does
 * not pay for loading the whole CLI). It decodes the request and hands it to
 * the same `runInherit` as without a PTY — no sink is routed in this
 * process, so the installer's terminal is the pseudo-terminal itself, and
 * execa resolves PATHEXT and escapes `.cmd` targets as always. The runner
 * sanitises the command and argv again here.
 *
 * It speaks the language the request carries: `cli.ts` never runs in this
 * process, so nothing else chooses one. A request it cannot decode names
 * none, and is refused in the default language.
 */

/** Exit status of a request the trampoline refuses. */
const EXIT_BAD_REQUEST = 2;

// Ctrl+C typed in the pane reaches the installer, which decides what it
// means; the trampoline outlives it and reports its exit code.
process.on("SIGINT", () => {});

process.exitCode = await runRequest(process.argv[2] ?? "");

async function runRequest(encoded: string): Promise<number> {
  let payload: TrampolinePayload;
  let result: RunResult;
  try {
    payload = decodePayload(encoded);
    setActiveLocale(payload.locale ?? DEFAULT_LOCALE);
    result = await runInherit(payload.command, [...payload.args], {
      ...(payload.cwd !== undefined && { cwd: payload.cwd }),
      ...(payload.shell !== undefined && { shell: payload.shell }),
      // The parent owns the install timeout: it kills this whole tree.
      timeout: 0,
    });
  } catch {
    process.stderr.write(`${PTY_LABELS.badRequest}\n`);
    return EXIT_BAD_REQUEST;
  }
  if (payload.exitFile !== undefined) reportExit(payload.exitFile, result.exitCode);
  return result.exitCode;
}

/** Best effort: without the file, the parent waits for the pseudo-terminal's exit event. */
function reportExit(path: string, exitCode: number): void {
  try {
    writeExitFile(path, exitCode);
  } catch {
    // The parent's directory is gone or unwritable: the slow path still works.
  }
}
