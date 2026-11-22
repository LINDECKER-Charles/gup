import type { AdminCredentials } from "../../auth/admin-credentials.js";
import type { AdminSessions } from "../../auth/admin-sessions.js";
import type { AppConfig } from "../../config/app-config.js";
import type { Clock } from "../../ports/clock.js";
import type { FeedbackRepository } from "../../ports/feedback-repository.js";
import type { InstallReader } from "../../ports/install-reader.js";
import type { InstallStore } from "../../ports/install-store.js";
import type { Mailer } from "../../ports/mail/mailer.js";
import type { OutboxMonitor } from "../../ports/mail/outbox-monitor.js";
import type { SessionCookie } from "./session-cookie.js";

/** What the back-office routes share. */
export interface AdminContext {
  readonly config: AppConfig;
  readonly feedback: FeedbackRepository;
  readonly installs: InstallStore;
  readonly journals: InstallReader;
  readonly outbox: OutboxMonitor;
  /** null when SMTP is not configured. */
  readonly mailer: Mailer | null;
  readonly clock: Clock;
  readonly sessions: AdminSessions;
  readonly credentials: AdminCredentials;
  readonly cookie: SessionCookie;
}
