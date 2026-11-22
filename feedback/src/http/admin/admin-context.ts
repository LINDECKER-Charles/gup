import type { AdminCredentials } from "../../auth/admin-credentials.js";
import type { AdminSessions } from "../../auth/admin-sessions.js";
import type { AppConfig } from "../../config/app-config.js";
import type { FeedbackRepository } from "../../ports/feedback-repository.js";
import type { InstallReader } from "../../ports/install-reader.js";
import type { InstallStore } from "../../ports/install-store.js";
import type { SessionCookie } from "./session-cookie.js";

/** What the back-office routes share. */
export interface AdminContext {
  readonly config: AppConfig;
  readonly feedback: FeedbackRepository;
  readonly installs: InstallStore;
  readonly journals: InstallReader;
  readonly sessions: AdminSessions;
  readonly credentials: AdminCredentials;
  readonly cookie: SessionCookie;
}
