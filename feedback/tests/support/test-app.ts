import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import type { AppDeps } from "../../src/app-deps.js";
import type { AppConfig } from "../../src/config/app-config.js";
import type { Clock } from "../../src/ports/clock.js";
import { PasswordHash } from "../../src/security/password-hash.js";
import { MemoryFeedbackRepository } from "./memory-feedback-repository.js";
import { MemoryInstallReader } from "./memory-install-reader.js";
import { MemoryInstallStore } from "./memory-install-store.js";
import { MemoryOutboxMonitor } from "./memory-outbox-monitor.js";
import { MemorySecondFactorStore } from "./memory-second-factor-store.js";
import { MemorySessionRepository } from "./memory-session-repository.js";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "correct horse battery staple";
export const PUBLIC_ORIGIN = "https://feedback.example.test";
export const LANDING_ORIGIN = "https://landing.example.test";
export const LANDING_URL = `${LANDING_ORIGIN}/gup/`;

/** scrypt is slow on purpose: hash the test password once per worker. */
const PASSWORD_HASH = await PasswordHash.create(ADMIN_PASSWORD);

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: "development",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgres://unused",
    publicOrigin: PUBLIC_ORIGIN,
    landingUrl: LANDING_URL,
    allowedOrigins: [LANDING_ORIGIN],
    trustProxy: false,
    admin: { username: ADMIN_USERNAME, passwordHash: PASSWORD_HASH, totpSecret: null },
    cookieSecure: true,
    mail: null,
    logRetentionDays: 90,
    outboxPollIntervalMs: 30_000,
    logLevel: "silent",
    ...overrides,
  };
}

/** A clock the test moves by hand. */
export class ManualClock implements Clock {
  #now = new Date("2026-11-20T10:00:00.000Z");

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now = new Date(this.#now.getTime() + ms);
  }
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly clock: ManualClock;
  readonly feedback: MemoryFeedbackRepository;
  readonly installs: MemoryInstallStore;
  readonly journals: MemoryInstallReader;
  readonly outbox: MemoryOutboxMonitor;
  readonly sessions: MemorySessionRepository;
  readonly secondFactors: MemorySecondFactorStore;
}

export async function createTestApp(overrides: Partial<AppDeps> = {}): Promise<TestApp> {
  const clock = new ManualClock();
  const feedback = new MemoryFeedbackRepository();
  const installs = new MemoryInstallStore();
  const sessions = new MemorySessionRepository();
  const journals = new MemoryInstallReader();
  const outbox = new MemoryOutboxMonitor();
  const secondFactors = new MemorySecondFactorStore();
  const app = await buildApp({
    config: testConfig(),
    feedback,
    installs,
    journals,
    outbox,
    mailer: null,
    sessions,
    secondFactors,
    health: { isHealthy: async () => true },
    clock,
    logger: false,
    ...overrides,
  });
  return { app, clock, feedback, installs, journals, outbox, sessions, secondFactors };
}
