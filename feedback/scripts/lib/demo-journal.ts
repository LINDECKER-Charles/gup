import { randomUUID } from "node:crypto";
import { DURATION_MS } from "../../src/time-units.js";

/**
 * Weeks of fictional journals for one install: runs every half-day or so,
 * each a scan, a few updates and the log lines written meanwhile, all under
 * the run's ID. A few updates fail and log an error. Placeholder data only.
 */
export interface DemoJournalOptions {
  readonly platform: "win32" | "linux";
  readonly weeks: number;
  /** Seeds the pseudo-random choices: the same seed, the same journals. */
  readonly seed: number;
  readonly now: Date;
}

type Json = Record<string, unknown>;

interface Package {
  readonly providerId: string;
  readonly packageId: string;
  readonly from: string;
  readonly to: string;
  /** Fails with this when the run's dice say so. */
  readonly failure: { readonly exitCode: number; readonly message: string };
}

const CLIENT = { gupVersion: "0.6.0", arch: "x64", node: "26.10.0", locale: "fr" };
const PROVIDERS = {
  win32: ["winget", "npm-g", "scoop"],
  linux: ["apt", "flatpak", "npm-g"],
} as const;
const PACKAGES: Record<DemoJournalOptions["platform"], readonly Package[]> = {
  win32: [
    { providerId: "winget", packageId: "Git.Git", from: "2.51.0", to: "2.52.0",
      failure: { exitCode: 1603,
        message: "Installer failed with exit code 1603 (log in C:\\Users\\demo\\AppData\\Local\\Temp\\WinGet)" } },
    { providerId: "winget", packageId: "Microsoft.PowerToys", from: "0.95.1", to: "0.96.0",
      failure: { exitCode: 1618, message: "Another installation is already in progress" } },
    { providerId: "npm-g", packageId: "typescript", from: "5.9.3", to: "6.0.2",
      failure: { exitCode: 1, message: "EBUSY: resource busy or locked" } },
    { providerId: "scoop", packageId: "ripgrep", from: "14.1.1", to: "15.0.0",
      failure: { exitCode: 2, message: "Hash check failed for ripgrep-15.0.0.zip" } },
  ],
  linux: [
    { providerId: "apt", packageId: "curl", from: "8.14.1", to: "8.15.0",
      failure: { exitCode: 100, message: "Could not get lock /var/lib/dpkg/lock-frontend" } },
    { providerId: "flatpak", packageId: "org.mozilla.firefox", from: "145.0", to: "146.0",
      failure: { exitCode: 1, message: "Remote flathub not reachable: timeout after 30 s" } },
    { providerId: "npm-g", packageId: "pnpm", from: "10.20.0", to: "10.22.1",
      failure: { exitCode: 243, message: "EACCES: permission denied, rename '/usr/lib/node_modules/pnpm'" } },
  ],
};
const TRIGGERS = ["menu", "menu", "schedule", "cli"] as const;
const PID_BASE = 1000;
const PID_RANGE = 60_000;
const RUN_GAP_HOURS = { min: 6, spread: 30 };
const FAILURE_RATE = 0.18;

/** A small seeded generator (mulberry32): reproducible demo data without a dependency. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

class RunWriter {
  readonly history: Json[] = [];
  readonly logs: Json[] = [];
  readonly #envelope: Json;
  readonly #pid: number;
  #at: number;

  constructor(envelope: Json, start: number, pid: number) {
    this.#envelope = envelope;
    this.#at = start;
    this.#pid = pid;
  }

  /** Moves the run's clock on, then logs. */
  log(afterMs: number, level: string, line: { event: string; ctx?: Json; data?: Json }): void {
    this.#at += afterMs;
    this.logs.push({
      v: 1, ts: new Date(this.#at).toISOString(), level, runId: this.#envelope["runId"],
      pid: this.#pid, ...line,
    });
  }

  /** A history record at the run's current time, a millisecond after the log before it. */
  record(fields: Json): void {
    this.#at += 1;
    this.history.push({ ...this.#envelope, ts: new Date(this.#at).toISOString(), ...fields });
  }
}

function scan(writer: RunWriter, options: DemoJournalOptions, roll: () => number): Package[] {
  const providers = PROVIDERS[options.platform].map((providerId) => ({
    providerId, durationMs: Math.round(300 + roll() * 4000),
  }));
  for (const provider of providers) {
    writer.log(provider.durationMs, "debug", {
      event: "scan.provider", ctx: { op: "scan", providerId: provider.providerId },
      data: { durationMs: provider.durationMs },
    });
  }
  const outdated = PACKAGES[options.platform].filter(() => roll() < 0.45);
  const counted = providers.map((provider) => ({
    ...provider,
    outdated: outdated.filter((item) => item.providerId === provider.providerId).length,
  }));
  const durationMs = counted.reduce((sum, provider) => sum + provider.durationMs, 0);
  writer.log(5, "info", { event: "scan.finished", data: { outdated: outdated.length, durationMs } });
  writer.record({ kind: "scan", durationMs, fast: roll() < 0.3, filter: [], providers: counted,
    outdated: outdated.length });
  return outdated;
}

function update(writer: RunWriter, item: Package, roll: () => number): void {
  const ctx = { op: "update", providerId: item.providerId, packageId: item.packageId };
  const durationMs = Math.round(2000 + roll() * 40_000);
  writer.log(20, "debug", { event: "update.started", ctx, data: { from: item.from, to: item.to } });
  writer.log(10, "trace", { event: "update.command", ctx, data: { attempt: 1 } });
  const versions = { providerId: item.providerId, packageId: item.packageId,
    from: item.from, to: item.to, durationMs };
  if (roll() < FAILURE_RATE) {
    writer.log(durationMs / 2, "warn", { event: "update.retry", ctx, data: { attempt: 2 } });
    writer.log(durationMs / 2, "error", { event: "update.failed", ctx,
      data: { exitCode: item.failure.exitCode, durationMs, message: item.failure.message } });
    writer.record({ kind: "update", ...versions, status: "failed", retry: "retry --force",
      message: item.failure.message });
    return;
  }
  writer.log(durationMs, "info", { event: "update.finished", ctx, data: { durationMs } });
  writer.record({ kind: "update", ...versions, status: roll() < 0.1 ? "skipped" : "success" });
}

function run(options: DemoJournalOptions, start: number, roll: () => number): RunWriter {
  const trigger = TRIGGERS[Math.floor(roll() * TRIGGERS.length)] ?? "menu";
  const envelope = { v: 1, runId: randomUUID(), gup: CLIENT.gupVersion,
    platform: options.platform, trigger };
  const writer = new RunWriter(envelope, start, PID_BASE + Math.floor(roll() * PID_RANGE));
  writer.log(0, "info", { event: "run.started", data: { trigger } });
  const outdated = scan(writer, options, roll);
  if (trigger !== "cli") for (const item of outdated) update(writer, item, roll);
  writer.log(40, "info", { event: "run.finished" });
  return writer;
}

/** The journals as upload batches, one per week, oldest first. */
export function demoBatches(options: DemoJournalOptions): Json[] {
  const roll = random(options.seed);
  const client = { ...CLIENT, platform: options.platform };
  const end = options.now.getTime();
  const batches: Json[] = [];
  let at = end - options.weeks * 7 * DURATION_MS.day;
  let week = { history: [] as Json[], logs: [] as Json[], until: at + 7 * DURATION_MS.day };
  while (at < end - DURATION_MS.hour) {
    const writer = run(options, at, roll);
    if (at >= week.until) {
      batches.push({ schema: 1, client, history: week.history, logs: week.logs });
      week = { history: [], logs: [], until: week.until + 7 * DURATION_MS.day };
    }
    week.history.push(...writer.history);
    week.logs.push(...writer.logs);
    at += (RUN_GAP_HOURS.min + roll() * RUN_GAP_HOURS.spread) * DURATION_MS.hour;
  }
  batches.push({ schema: 1, client, history: week.history, logs: week.logs });
  return batches;
}
