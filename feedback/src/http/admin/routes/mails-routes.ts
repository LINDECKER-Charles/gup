import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isEmailAddress } from "../../../domain/email-address.js";
import type { NotifyRecipient } from "../../../mail/notify-recipient.js";
import { RETRY_POLICY } from "../../../mail/retry-policy.js";
import { smtpEndpoint } from "../../../mail/smtp-endpoint.js";
import { testMail } from "../../../mail/test-mail.js";
import type { Mailer, OutgoingMail } from "../../../ports/mail/mailer.js";
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

/** The `to` field of a form, trimmed; "" when absent. */
function typedAddress(request: FastifyRequest): string {
  return (new RequestParams(request.body).text("to") ?? "").trim();
}

/** The mail relay: its settings as read, the outbox, the recipient, a test mail, a retry. */
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
    app.post("/mails/recipient", this.changeRecipient);
    app.post("/mails/recipient/reset", this.resetRecipient);
  }

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = new RequestParams(request.query);
    const sentSince = new Date(
      this.#context.clock.now().getTime() - SENT_WINDOW_DAYS * DURATION_MS.day);
    const [counts, unsent, relay] = await Promise.all([
      this.#context.outbox.counts(sentSince),
      this.#context.outbox.listUnsent({ page: query.page(), pageSize: PAGE_SIZE }),
      this.#relay(),
    ]);
    return sendHtml(reply, mailsPage({
      csrfToken: csrfTokenOf(request), notice: query.text("ok"), relay,
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

  readonly changeRecipient = async (request: FastifyRequest, reply: FastifyReply) => {
    const recipient = this.#recipient();
    if (recipient === null) return this.#done(reply, "recipient-unconfigured");
    const address = typedAddress(request);
    if (!isEmailAddress(address)) return this.#done(reply, "recipient-invalid");
    await recipient.change(address, this.#context.clock.now());
    return this.#done(reply, address === recipient.configured
      ? "recipient-reset"
      : "recipient-saved");
  };

  readonly resetRecipient = async (_request: FastifyRequest, reply: FastifyReply) => {
    const recipient = this.#recipient();
    if (recipient === null) return this.#done(reply, "recipient-unconfigured");
    await recipient.reset();
    return this.#done(reply, "recipient-reset");
  };

  async #sendTest(gate: RateLimitGate, request: FastifyRequest, reply: FastifyReply) {
    const { mailer, config, clock } = this.#context;
    const recipient = this.#recipient();
    if (mailer === null || config.mail === null || recipient === null) {
      return this.#done(reply, "test-unconfigured");
    }
    const { address: notifyTo } = await recipient.current();
    // Left empty, the test goes where notifications go.
    const to = typedAddress(request) || notifyTo;
    if (!isEmailAddress(to)) return this.#done(reply, "test-invalid");
    if (await gate.isExhausted(request)) return this.#done(reply, "test-limited");
    await gate.count(request);
    const { publicOrigin } = config;
    return this.#deliverTest(reply, mailer, testMail({
      mail: config.mail, to, notifyTo, publicOrigin, sentAt: clock.now(),
    }));
  }

  async #deliverTest(
    reply: FastifyReply, mailer: Mailer, mail: OutgoingMail,
  ): Promise<FastifyReply> {
    const { clock } = this.#context;
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

  /** null when SMTP is not configured: no relay, so no recipient to choose. */
  #recipient(): NotifyRecipient | null {
    return this.#context.mailer === null ? null : this.#context.recipient;
  }

  async #relay(): Promise<RelayView | null> {
    const { mail } = this.#context.config;
    const recipient = this.#recipient();
    if (mail === null || recipient === null) return null;
    return {
      endpoint: smtpEndpoint(mail.smtpUrl), from: mail.from,
      recipient: await recipient.current(), configuredTo: recipient.configured,
    };
  }

  #done(reply: FastifyReply, notice: string): FastifyReply {
    return reply.redirect(`${ADMIN_UI.mailsPath}?ok=${notice}`, HTTP_STATUS.seeOther);
  }
}

export function registerMailsRoutes(app: FastifyInstance, context: AdminContext): void {
  new MailsEndpoints(context).register(app);
}
