import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config/app-config.js";
import { ConfigError } from "./config/config-error.js";
import { loadConfig } from "./config/load-config.js";
import { IntervalTask } from "./jobs/interval-task.js";
import { RetentionJob } from "./jobs/retention-job.js";
import { loggerOptions } from "./logger-options.js";
import { NodemailerMailer } from "./mail/nodemailer-mailer.js";
import { OutboxWorker } from "./mail/outbox-worker.js";
import { SYSTEM_CLOCK } from "./ports/clock.js";
import { migrate } from "./store/migrate.js";
import { PgFeedbackRepository } from "./store/feedback/pg-feedback-repository.js";
import { PgHealthProbe } from "./store/pg-health-probe.js";
import { PgInstallReader } from "./store/pg-install-reader.js";
import { PgInstallStore } from "./store/pg-install-store.js";
import { PgOutboxRepository } from "./store/feedback/pg-outbox-repository.js";
import { PgRetentionStore } from "./store/pg-retention-store.js";
import { PgSessionRepository } from "./store/pg-session-repository.js";

const POOL_SIZE = 10;
const CONNECT_TIMEOUT_MS = 5000;
/** Postgres may start after the app (host reboot, fresh deploy): wait up to a minute. */
const DATABASE_ATTEMPTS = 30;
const DATABASE_RETRY_MS = 2000;
/** A shutdown that hangs longer is killed: the orchestrator would SIGKILL it anyway. */
const SHUTDOWN_DEADLINE_MS = 10_000;
const EXIT_FAILURE = 1;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(EXIT_FAILURE);
}

async function readConfig(): Promise<AppConfig> {
  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    fail(error.message);
  }
  try {
    await config.admin.passwordHash.checkDerivable();
  } catch (error) {
    fail(`ADMIN_PASSWORD_HASH cannot be derived on this host: ${(error as Error).message}`);
  }
  return config;
}

async function waitForDatabase(pool: pg.Pool, app: FastifyInstance): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt >= DATABASE_ATTEMPTS) throw error;
      app.log.warn({ attempt, error: (error as Error).message }, "database not ready, retrying");
      await new Promise((resolve) => setTimeout(resolve, DATABASE_RETRY_MS));
    }
  }
}

function retentionTask(config: AppConfig, pool: pg.Pool, app: FastifyInstance): IntervalTask {
  const job = new RetentionJob({
    store: new PgRetentionStore(pool), clock: SYSTEM_CLOCK,
    retentionDays: config.logRetentionDays, logger: app.log,
  });
  const run = () => job.run();
  return new IntervalTask({
    name: "retention", intervalMs: RetentionJob.intervalMs, run, logger: app.log,
  });
}

/** No SMTP: one warning, and the mails wait in the outbox until a restart with SMTP set. */
function outboxTask(config: AppConfig, pool: pg.Pool, app: FastifyInstance): IntervalTask | null {
  if (config.mail === null) {
    app.log.warn("SMTP_URL is not set: notification mails stay queued in the outbox");
    return null;
  }
  const worker = new OutboxWorker({
    outbox: new PgOutboxRepository(pool), mailer: new NodemailerMailer(config.mail.smtpUrl),
    clock: SYSTEM_CLOCK, mail: config.mail, publicOrigin: config.publicOrigin, logger: app.log,
  });
  const run = () => worker.runOnce();
  return new IntervalTask({
    name: "outbox", intervalMs: config.outboxPollIntervalMs, run, logger: app.log,
  });
}

function onShutdown(stop: () => Promise<void>, app: FastifyInstance): void {
  const shutdown = (signal: string) => {
    app.log.info({ signal }, "shutting down");
    setTimeout(() => process.exit(EXIT_FAILURE), SHUTDOWN_DEADLINE_MS).unref();
    stop().then(() => process.exit(0), (error: unknown) => {
      app.log.error({ err: error }, "shutdown failed");
      process.exit(EXIT_FAILURE);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

async function main(): Promise<void> {
  const config = await readConfig();
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: POOL_SIZE,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  const app = await buildApp({
    config, clock: SYSTEM_CLOCK, logger: loggerOptions(config.logLevel),
    feedback: new PgFeedbackRepository(pool), installs: new PgInstallStore(pool),
    journals: new PgInstallReader(pool), sessions: new PgSessionRepository(pool),
    health: new PgHealthProbe(pool),
  });
  pool.on("error", (error) => app.log.error({ err: error }, "idle database client failed"));
  await waitForDatabase(pool, app);
  app.log.info({ applied: await migrate(pool) }, "migrations up to date");
  const tasks = [retentionTask(config, pool, app), outboxTask(config, pool, app)]
    .filter((task) => task !== null);
  for (const task of tasks) task.start();
  onShutdown(async () => {
    await Promise.all(tasks.map((task) => task.stop()));
    await app.close();
    await pool.end();
  }, app);
  await app.listen({ host: config.host, port: config.port });
}

await main();
