import { lstat, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stateDir } from "../state/app-dirs.js";

/**
 * Where gup's exports land (diagnostic archives, reports, history exports):
 * an explicit `--out` path, or a dated name in the reports directory.
 *
 * A file is always created, never reused: the default name is opened with
 * `wx` (a name taken by another run gets a `-2`… suffix), and `--out` only
 * replaces an existing file under `--force`. The reports directory keeps the
 * newest files of each kind; an explicit `--out` is the user's and is never
 * pruned. Files are private to the user (0600 on POSIX).
 */

export type OutputKind = "report" | "history" | "diagnostic";
export type OutputExtension = "html" | "json" | "csv" | "zip";

/** Files of each kind kept in the reports directory. */
export const RETAINED_PER_KIND = 20;
/** Suffixes tried when a default name is taken: `-2` … `-9`. */
const MAX_SUFFIX = 9;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const OUTPUT_NAME = /^gup-(report|history|diagnostic)-\d{8}-\d{6}(?:-\d)?\.(?:html|json|csv|zip)$/;

export interface OutputRequest {
  readonly kind: OutputKind;
  readonly extension: OutputExtension;
  readonly content: string | Uint8Array;
  /** The user's `--out`: written there, never pruned. */
  readonly out?: string;
  /** Replace an existing `out`. */
  readonly force?: boolean;
  readonly now?: Date;
}

/** `--out` names a file that exists, and `--force` was not given. */
export class OutputExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} existe déjà`);
    this.name = "OutputExistsError";
  }
}

/** The file written, as an absolute path. */
export async function writeOutputFile(request: OutputRequest): Promise<string> {
  if (request.out !== undefined) return writeExplicit(request.out, request);
  const dir = stateDir("reports");
  if (dir === null) throw new Error("aucun dossier de rapports sur cette plateforme");
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const path = await writeDated(dir, request);
  await pruneKind(dir, request.kind);
  return path;
}

/** `gup-<kind>-YYYYMMDD-HHmmss.<ext>`, in local time (the name the user reads). */
export function outputFileName(kind: OutputKind, extension: OutputExtension, now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `gup-${kind}-${date}-${time}.${extension}`;
}

async function writeExplicit(out: string, request: OutputRequest): Promise<string> {
  const path = resolve(out);
  const flag = request.force === true ? "w" : "wx";
  try {
    await writeFile(path, request.content, { flag, mode: FILE_MODE });
  } catch (error) {
    if (isCode(error, "EEXIST")) throw new OutputExistsError(path);
    throw error;
  }
  return path;
}

async function writeDated(dir: string, request: OutputRequest): Promise<string> {
  const name = outputFileName(request.kind, request.extension, request.now ?? new Date());
  const stem = name.slice(0, -(request.extension.length + 1));
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix++) {
    const candidate = suffix === 1 ? name : `${stem}-${suffix}.${request.extension}`;
    const path = join(dir, candidate);
    try {
      await writeFile(path, request.content, { flag: "wx", mode: FILE_MODE });
      return path;
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw error;
    }
  }
  throw new Error(`${name} : trop d'exports dans la même seconde`);
}

/**
 * Keep the newest {@link RETAINED_PER_KIND} files of `kind`. Only names gup
 * writes, only regular files: never a symlink nor a junction. Best-effort.
 */
async function pruneKind(dir: string, kind: OutputKind): Promise<void> {
  try {
    const names = (await readdir(dir)).filter((name) => OUTPUT_NAME.exec(name)?.[1] === kind);
    if (names.length <= RETAINED_PER_KIND) return;
    const files = await Promise.all(names.map((name) => regularFile(join(dir, name))));
    const existing = files.filter((file): file is RegularFile => file !== null);
    existing.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
    const expired = existing.slice(RETAINED_PER_KIND);
    await Promise.all(expired.map((file) => unlink(file.path).catch(() => {})));
  } catch {
    // Housekeeping only: the export itself succeeded.
  }
}

interface RegularFile {
  readonly path: string;
  readonly mtimeMs: number;
}

async function regularFile(path: string): Promise<RegularFile | null> {
  try {
    const stats = await lstat(path);
    return stats.isFile() ? { path, mtimeMs: stats.mtimeMs } : null;
  } catch {
    return null;
  }
}

function isCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === code;
}
