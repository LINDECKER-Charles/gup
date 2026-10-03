import { randomBytes } from "node:crypto";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The Windows fast path for an install's exit code. node-pty reports a ConPTY
 * child's exit only after a fixed one-second flush of the output pipe, which a
 * batch would pay on every package. The trampoline writes its exit code here
 * just before exiting, and the parent polls for it.
 *
 * The file lives in a private `mkdtemp` directory under a random name. The
 * child writes `<name>.tmp` with `wx` (never through a file someone staged)
 * and renames it, so the parent reads either nothing or the whole content;
 * the parent accepts one signed integer and a newline, nothing else, and
 * otherwise keeps waiting for node-pty's own exit event.
 */

/** How often the parent looks for the file. */
export const EXIT_POLL_MS = 100;

const DIR_PREFIX = "gup-pty-";
const NAME_BYTES = 8;
const EXIT_SUFFIX = ".exit";
const TEMP_SUFFIX = ".tmp";
const EXIT_CONTENT = /^-?\d{1,10}\n$/;

/** One exit file: its path, and the removal of its private directory. */
export interface ExitFileSlot {
  readonly path: string;
  release(): Promise<void>;
}

/** A fresh private directory and a random file name in it. Throws when the temp dir is unusable. */
export function createExitFileSlot(): ExitFileSlot {
  const dir = mkdtempSync(join(tmpdir(), DIR_PREFIX));
  const name = `${randomBytes(NAME_BYTES).toString("hex")}${EXIT_SUFFIX}`;
  return {
    path: join(dir, name),
    release: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

/** Child side: write `exitCode` atomically. Throws when the file cannot be written. */
export function writeExitFile(path: string, exitCode: number): void {
  const temporary = `${path}${TEMP_SUFFIX}`;
  writeFileSync(temporary, `${exitCode}\n`, { flag: "wx" });
  renameSync(temporary, path);
}

/** Parent side: the exit code, or null while there is no valid file. Never rejects. */
export async function readExitFile(path: string): Promise<number | null> {
  try {
    const content = await readFile(path, "utf8");
    return EXIT_CONTENT.test(content) ? Number.parseInt(content, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Poll `path` every {@link EXIT_POLL_MS} until it holds a valid exit code,
 * hand it to `onCode` once, and stop. Returns the stop for the caller that
 * learnt the exit another way.
 */
export function watchExitFile(path: string, onCode: (code: number) => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  let isStopped = false;
  const poll = async (): Promise<void> => {
    const code = await readExitFile(path);
    if (isStopped) return;
    if (code === null) {
      timer = setTimeout(() => void poll(), EXIT_POLL_MS);
      return;
    }
    isStopped = true;
    onCode(code);
  };
  timer = setTimeout(() => void poll(), EXIT_POLL_MS);
  return () => {
    isStopped = true;
    if (timer) clearTimeout(timer);
  };
}
