import type { PasswordHash } from "../security/password-hash.js";

export type FeedbackEnv = "production" | "development";

export interface MailConfig {
  /** nodemailer connection URL, e.g. `smtps://user:pass@smtp.example.com:465`. */
  readonly smtpUrl: string;
  readonly from: string;
  readonly notifyTo: string;
}

export interface AppConfig {
  readonly env: FeedbackEnv;
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  /** Origin of this service (`https://feedback.global-updater.com`), no trailing slash. */
  readonly publicOrigin: string;
  readonly landingUrl: string;
  /** Origins allowed to post feedback: CORS and the form redirect. */
  readonly allowedOrigins: readonly string[];
  /** Fastify `trustProxy`: which peers may set `X-Forwarded-For`. */
  readonly trustProxy: boolean | readonly string[];
  readonly admin: {
    readonly username: string;
    readonly passwordHash: PasswordHash;
    /** Key of the authenticator app; null = no second factor (development only). */
    readonly totpSecret: Buffer | null;
  };
  /** false only for local http development: drops `Secure` and the `__Host-` prefix. */
  readonly cookieSecure: boolean;
  /** null = no SMTP: feedback is accepted and its mail waits in the outbox. */
  readonly mail: MailConfig | null;
  readonly logRetentionDays: number;
  readonly outboxPollIntervalMs: number;
  readonly logLevel: string;
}
