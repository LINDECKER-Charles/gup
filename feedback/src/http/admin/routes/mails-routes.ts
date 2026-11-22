import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RETRY_POLICY } from "../../../mail/retry-policy.js";
import { smtpEndpoint } from "../../../mail/smtp-endpoint.js";
import { testMail } from "../../../mail/test-mail.js";
import { DURATION_MS } from "../../../time-units.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { mailsPage } from "../../../views/pages/mails/mails-page.js";
import type { MailTestOutcome, RelayView } from "../../../views/pages/mails/relay-panel.js";
import { HTTP_STATUS } from "../../http-status.js";
import { RateLimitGate } from "../../rate-limit-gate.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const PAGE_SIZE = 50;
const SENT_WINDOW_DAYS = 30;
/** Per client address: a relay is tested, not flooded; one counts against its quota. */
const TEST_LIMIT = { max: 5, windowMs: 10 * DURATION_MS.minute } as const;
/** An SMTP error rarely needs more; the page shows it whole, escaped. */
const MAX_ERROR_LENGTH = 1000;

/** The mail relay: its settings as read, the outbox, a test mail and a retry lever. */
class MailsEndpoints {
  readonly #context: AdminContext;
  /** Per process: a restart forgets it, the relay's own log keeps the trace. */
  #lastTest: MailTestOutcome | null = null;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    const tests = new RateLimitGate(
      app.createRateLimit({ max: TEST_LIMIT.max, timeWindow: TEST_LIMIT.windowMs }));
    app.get("/mails", this.show);
    app.post("/mails/test", (request, reply) => this.#sendTest(tests, request, reply));
    app.post("/mails/retry", this.retry);
  }

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = new RequestParams(request.query);
    const sentSince = new Date(
      this.#context.clock.now().getTime() - SENT_WINDOW_DAYS * DURATION_MS.day);
    const [counts, unsent] = await Promise.all([
      this.#context.outbox.counts(sentSince),
      this.#context.outbox.listUnsent({ page: query.page(), pageSize: PAGE_SIZE }),
    ]);
    return sendHtml(reply, mailsPage({
      csrfToken: csrfTokenOf(request), notice: query.text("ok"), relay: this.#relay(),
      pollIntervalMs: this.#context.config.outboxPollIntervalMs,
      maxAttempts: RETRY_POLICY.maxAttempts, lastTest: this.#lastTest, testLimit: TEST_LIMIT,
      counts, unsent, sentWindowDays: SENT_WINDOW_DAYS,
    }));
  };

  readonly retry = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (this.#context.mailer === null) return this.#done(reply, "retry-unconfigured");
    const retried = await this.#context.outbox.retryNow({
      now: this.#context.clock.now(), maxAttempts: RETRY_POLICY.maxAttempts,
    });
    return this.#done(reply, retried === 0 ? "retry-none" : "retried");
  };

  async #sendTest(gate: RateLimitGate, request: FastifyRequest, reply: FastifyReply) {
    const { mailer, config, clock } = this.#context;
    if (mailer === null || config.mail === null) return this.#done(reply, "test-unconfigured");
    if (await gate.isExhausted(request)) return this.#done(reply, "test-limited");
    await gate.count(request);
    const { publicOrigin } = config;
    const mail = testMail({ mail: config.mail, publicOrigin, sentAt: clock.now() });
    try {
      await mailer.send(mail);
      this.#lastTest = { at: clock.now(), to: mail.to, error: null };
      return this.#done(reply, "test-sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#lastTest = { at: clock.now(), to: mail.to, error: message.slice(0, MAX_ERROR_LENGTH) };
      return this.#done(reply, "test-failed");
    }
  }

  #relay(): RelayView | null {
    const { mail } = this.#context.config;
    if (mail === null || this.#context.mailer === null) return null;
    return { endpoint: smtpEndpoint(mail.smtpUrl), from: mail.from, to: mail.notifyTo };
  }

  #done(reply: FastifyReply, notice: string): FastifyReply {
    return reply.redirect(`${ADMIN_UI.mailsPath}?ok=${notice}`, HTTP_STATUS.seeOther);
  }
}

export function registerMailsRoutes(app: FastifyInstance, context: AdminContext): void {
  new MailsEndpoints(context).register(app);
}
