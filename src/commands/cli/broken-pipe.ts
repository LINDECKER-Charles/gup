/** A process exit, injectable for tests. */
export type Exit = (code: number) => void;

const BROKEN_PIPE = "EPIPE";

/**
 * `gup report -f csv | head`, `gup doctor | true`: once the reader is gone,
 * the next write to standard output fails with EPIPE — on Windows as on
 * POSIX, since Node ignores SIGPIPE — and the unhandled stream error ended
 * the run with a stack trace and exit code 1. Nobody reads what is left to
 * print: the run exits at once, silently, with 0. Any other error of the
 * stream is thrown again, as if nothing listened.
 */
export function exitQuietlyOnBrokenPipe(
  stream: NodeJS.WritableStream,
  exit: Exit = (code) => process.exit(code),
): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== BROKEN_PIPE) throw error;
    exit(0);
  });
}
