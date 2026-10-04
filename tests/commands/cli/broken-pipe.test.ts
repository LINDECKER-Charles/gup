import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { exitQuietlyOnBrokenPipe } from "../../../src/commands/cli/broken-pipe.js";

/** The error a write to a pipe nobody reads gets, on Windows as on POSIX. */
function streamError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: write`), { code, syscall: "write" });
}

describe("exitQuietlyOnBrokenPipe", () => {
  it("exits 0, printing nothing, when the reader of standard output is gone", () => {
    const stdout = new PassThrough();
    const exit = vi.fn();
    exitQuietlyOnBrokenPipe(stdout, exit);

    stdout.emit("error", streamError("EPIPE"));

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("lets any other error of the stream through, as if nobody listened", () => {
    const stdout = new PassThrough();
    const exit = vi.fn();
    exitQuietlyOnBrokenPipe(stdout, exit);

    expect(() => stdout.emit("error", streamError("EIO"))).toThrow("EIO: write");
    expect(exit).not.toHaveBeenCalled();
  });
});
