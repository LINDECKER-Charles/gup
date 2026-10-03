import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomic } from "../../config/atomic-write.js";
import type { CapturedEnv } from "../trigger/captured-env.js";
import type { Launcher, Mechanism } from "../trigger/os-trigger.js";

/**
 * `install.json`: what gup registered with the OS, and from which gup. It
 * lets an interactive start tell whether the registered command still
 * points at this installation (self-heal), keeps the launcher choice across
 * repairs, and carries the environment the POSIX tick applies.
 */

export interface InstallRecord {
  readonly v: 1;
  readonly platform: NodeJS.Platform;
  readonly mechanism: Mechanism;
  readonly launcher: Launcher;
  /** `[node, entry, "__schedule-tick"]`, as registered. */
  readonly argv: readonly string[];
  /** Captured environment (macOS, Linux); empty on Windows. */
  readonly env: CapturedEnv;
  /** ISO 8601, UTC. */
  readonly installedAt: string;
  readonly gupVersion: string;
}

const DIR_MODE = 0o700;
const MECHANISMS: readonly Mechanism[] = ["windows-task", "launchd", "crontab"];
const LAUNCHERS: readonly Launcher[] = ["headless", "direct"];

export class InstallRecordStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  /** The record, or null when absent or unreadable (then nothing counts as installed by gup). */
  read(): InstallRecord | null {
    try {
      return parseRecord(JSON.parse(readFileSync(this.#file, "utf8")));
    } catch {
      return null;
    }
  }

  write(record: InstallRecord): void {
    mkdirSync(dirname(this.#file), { recursive: true, mode: DIR_MODE });
    writeFileAtomic(this.#file, `${JSON.stringify(record, null, 2)}\n`);
  }

  remove(): void {
    rmSync(this.#file, { force: true });
  }
}

function parseRecord(raw: unknown): InstallRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Partial<Record<keyof InstallRecord, unknown>>;
  const mechanism = MECHANISMS.find((candidate) => candidate === record.mechanism);
  const launcher = LAUNCHERS.find((candidate) => candidate === record.launcher);
  const argv = stringList(record.argv);
  if (record.v !== 1 || !mechanism || !launcher || argv.length < 2) return null;
  return {
    v: 1,
    platform: String(record.platform) as NodeJS.Platform,
    mechanism,
    launcher,
    argv,
    env: stringRecord(record.env),
    installedAt: String(record.installedAt ?? ""),
    gupVersion: String(record.gupVersion ?? ""),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.every((item) => typeof item === "string") ? (value as string[]) : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}
