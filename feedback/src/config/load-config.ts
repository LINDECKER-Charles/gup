import { PasswordHash } from "../security/password-hash.js";
import { DURATION_MS } from "../time-units.js";
import type { AppConfig, FeedbackEnv, MailConfig } from "./app-config.js";
import { ConfigError } from "./config-error.js";
import { EnvReader } from "./env-reader.js";
import { readTrustProxy } from "./read-trust-proxy.js";

const DEFAULTS = {
  host: "0.0.0.0",
  port: 8080,
  landingUrl: "https://lindecker-charles.github.io/gup/",
  logRetentionDays: 90,
  outboxPollIntervalSeconds: 30,
  logLevel: "info",
} as const;

const MAX_PORT = 65_535;
const MAX_RETENTION_DAYS = 3650;
const MAX_POLL_SECONDS = 3600;
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const ENVIRONMENTS: readonly FeedbackEnv[] = ["production", "development"];
const ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SMTP_URL_PATTERN = /^smtps?:\/\//;

function readEnvironment(reader: EnvReader): FeedbackEnv {
  const raw = reader.optional("FEEDBACK_ENV") ?? "production";
  const env = ENVIRONMENTS.find((candidate) => candidate === raw);
  if (env === undefined) reader.reject("FEEDBACK_ENV", "must be production or development");
  return env ?? "production";
}

function readPasswordHash(reader: EnvReader): PasswordHash | null {
  const raw = reader.required("ADMIN_PASSWORD_HASH");
  if (raw === "") return null;
  try {
    return PasswordHash.parse(raw);
  } catch (error) {
    reader.reject("ADMIN_PASSWORD_HASH", `is malformed (${(error as Error).message})`);
    return null;
  }
}

function readAddress(reader: EnvReader, name: string): string {
  const address = reader.required(name);
  if (address !== "" && !ADDRESS_PATTERN.test(address)) reader.reject(name, "is not an address");
  return address;
}

function readMail(reader: EnvReader): MailConfig | null {
  const smtpUrl = reader.optional("SMTP_URL");
  if (smtpUrl === null) return null;
  if (!SMTP_URL_PATTERN.test(smtpUrl)) {
    reader.reject("SMTP_URL", "must start with smtp:// or smtps://");
  }
  return {
    smtpUrl,
    from: readAddress(reader, "MAIL_FROM"),
    notifyTo: readAddress(reader, "FEEDBACK_NOTIFY_TO"),
  };
}

function readLogLevel(reader: EnvReader): string {
  const level = reader.optional("LOG_LEVEL") ?? DEFAULTS.logLevel;
  if (!LOG_LEVELS.includes(level)) {
    reader.reject("LOG_LEVEL", `must be one of ${LOG_LEVELS.join(", ")}`);
  }
  return level;
}

function readDurations(reader: EnvReader) {
  const days = { fallback: DEFAULTS.logRetentionDays, min: 1, max: MAX_RETENTION_DAYS };
  const poll = { fallback: DEFAULTS.outboxPollIntervalSeconds, min: 1, max: MAX_POLL_SECONDS };
  return {
    logRetentionDays: reader.integer("LOG_RETENTION_DAYS", days),
    outboxPollIntervalMs: reader.integer("OUTBOX_POLL_INTERVAL_SECONDS", poll) * DURATION_MS.second,
  };
}

/** An admin cookie without `Secure` is a local-http convenience, never a production setting. */
function readCookieSecure(reader: EnvReader, env: FeedbackEnv): boolean {
  const isSecure = reader.boolean("COOKIE_SECURE", true);
  if (!isSecure && env === "production") {
    reader.reject("COOKIE_SECURE", "may be false only with FEEDBACK_ENV=development");
  }
  return isSecure;
}

/** Plain http is a local-development convenience: in production the cookie needs https. */
function readOrigins(reader: EnvReader, env: FeedbackEnv) {
  const publicUrl = reader.webUrl("FEEDBACK_PUBLIC_URL");
  if (env === "production" && publicUrl?.protocol === "http:") {
    reader.reject("FEEDBACK_PUBLIC_URL", "must be https with FEEDBACK_ENV=production");
  }
  const landing = reader.webUrl("FEEDBACK_LANDING_URL", DEFAULTS.landingUrl);
  const landingOrigins = landing === null ? [] : [landing.origin];
  return {
    publicOrigin: publicUrl?.origin ?? "",
    landingUrl: landing?.href ?? DEFAULTS.landingUrl,
    allowedOrigins: reader.origins("FEEDBACK_ALLOWED_ORIGINS", landingOrigins),
  };
}

/** Builds the configuration from the environment; throws a ConfigError listing every problem. */
export function loadConfig(variables: Readonly<Record<string, string | undefined>>): AppConfig {
  const reader = new EnvReader(variables);
  const passwordHash = readPasswordHash(reader);
  const env = readEnvironment(reader);
  const config = {
    env,
    host: reader.optional("HOST") ?? DEFAULTS.host,
    port: reader.integer("PORT", { fallback: DEFAULTS.port, min: 1, max: MAX_PORT }),
    databaseUrl: reader.required("DATABASE_URL"),
    ...readOrigins(reader, env),
    trustProxy: readTrustProxy(reader),
    cookieSecure: readCookieSecure(reader, env),
    mail: readMail(reader),
    ...readDurations(reader),
    logLevel: readLogLevel(reader),
  };
  const username = reader.required("ADMIN_USERNAME");
  if (reader.errors.length > 0 || passwordHash === null) throw new ConfigError(reader.errors);
  return { ...config, admin: { username, passwordHash } };
}
