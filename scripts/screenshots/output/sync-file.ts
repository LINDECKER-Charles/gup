import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** `write` brings files up to date; `check` only compares and writes nothing. */
export type SyncMode = "write" | "check";

export interface SyncResult {
  readonly path: string;
  /** `stale` and `missing` only happen in check mode, `written` only in write mode. */
  readonly status: "unchanged" | "written" | "stale" | "missing";
}

/**
 * Write `content` to `path` (write mode), or tell whether the file already
 * holds it (check mode). Line endings are compared normalised: a Windows
 * checkout with CRLF endings is not out of date.
 */
export async function syncFile(path: string, content: string, mode: SyncMode): Promise<SyncResult> {
  const current = await readIfPresent(path);
  if (current !== null && toLf(current) === toLf(content)) return { path, status: "unchanged" };
  if (mode === "check") return { path, status: current === null ? "missing" : "stale" };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return { path, status: "written" };
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}
