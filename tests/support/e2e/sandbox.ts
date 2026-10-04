import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFilePath } from "../../../src/core/config/paths.js";
import { SCAN_SECTION } from "../../../src/core/config/scan-section.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { parseHistoryLine } from "../../../src/core/history/parse-event.js";
import type { HistoryEvent } from "../../../src/core/history/types.js";

/**
 * A throw-away home for one end-to-end suite. Every directory gup writes to —
 * history, settings, debug log, reports, scheduler — and npm's global prefix
 * and cache live under one temp root, so the built CLI can scan, and update,
 * for real without touching the developer's profile or the machine's global
 * packages. Rule: a suite creates its sandbox in `beforeAll` and disposes of
 * it in `afterAll`; nothing it starts runs with any other environment.
 */

export interface SandboxDirs {
  readonly history: string;
  readonly config: string;
  readonly logs: string;
  readonly reports: string;
  readonly scheduler: string;
  /** `npm_config_prefix`: where `npm i -g` installs and what `npm outdated -g` reads. */
  readonly npmPrefix: string;
  readonly npmCache: string;
}

export interface Sandbox {
  readonly root: string;
  readonly dirs: SandboxDirs;
  /**
   * The complete environment of a process started in the sandbox: the
   * worker's own, without gup's knobs and the npm lifecycle variables, plus
   * the sandbox's directories.
   */
  readonly env: Readonly<Record<string, string>>;
  dispose(): Promise<void>;
}

/**
 * Not inherited: gup's own variables (the test env turns history, settings
 * and the log off; a developer's shell may hold more), and the `npm_*`
 * variables of the `npm run` that started the tests, which name the real
 * global prefix and cache. npm's own settings still come from `.npmrc`.
 */
const NOT_INHERITED = /^(?:GUP_|npm_)/i;

export async function createSandbox(label: string): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), `gup-e2e-${label}-`));
  const dirs: SandboxDirs = {
    history: join(root, "history"),
    config: join(root, "config"),
    logs: join(root, "logs"),
    reports: join(root, "reports"),
    scheduler: join(root, "scheduler"),
    npmPrefix: join(root, "npm"),
    npmCache: join(root, "npm-cache"),
  };
  await mkdir(dirs.npmPrefix, { recursive: true });
  return {
    root,
    dirs,
    env: { ...inheritedEnv(), ...sandboxVariables(dirs) },
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 3 }),
  };
}

/**
 * What a process started in a sandbox keeps of `env`: everything but gup's
 * variables and npm's lifecycle ones. Also the environment the harness
 * detects the embedded terminal in, so it finds what the CLI under test finds.
 */
export function inheritedEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const kept = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !NOT_INHERITED.test(entry[0]),
  );
  return Object.fromEntries(kept);
}

function sandboxVariables(dirs: SandboxDirs): Record<string, string> {
  return {
    GUP_HISTORY_DIR: dirs.history,
    GUP_CONFIG_DIR: dirs.config,
    GUP_LOG_DIR: dirs.logs,
    GUP_REPORT_DIR: dirs.reports,
    GUP_SCHEDULER_DIR: dirs.scheduler,
    npm_config_prefix: dirs.npmPrefix,
    npm_config_cache: dirs.npmCache,
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

/**
 * Have the menu scan only `providerIds`, through the settings file the
 * Options view writes: on a real machine the menu otherwise scans every
 * installed tool, which is neither fast nor the same twice.
 */
export function restrictMenuScan(sandbox: Sandbox, providerIds: readonly string[]): void {
  const store = new ConfigStore({ file: configFilePath({ env: sandbox.env }) });
  store.update(SCAN_SECTION, (current) => ({ ...current, providerFilter: [...providerIds] }));
}

/** Every record the sandbox's history holds, oldest first (the shards are monthly). */
export async function historyEvents(sandbox: Sandbox): Promise<HistoryEvent[]> {
  const shards = (await readdir(sandbox.dirs.history).catch(() => [])).sort();
  const events: HistoryEvent[] = [];
  for (const shard of shards) {
    const content = await readFile(join(sandbox.dirs.history, shard), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = line.trim() ? parseHistoryLine(line) : null;
      if (parsed?.kind === "event") events.push(parsed.event);
    }
  }
  return events;
}
