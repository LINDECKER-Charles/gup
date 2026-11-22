import { describe, expect, it } from "vitest";
import type { Feedback } from "../../src/domain/feedback.js";
import { NotifyRecipient } from "../../src/mail/notify-recipient.js";
import { OutboxWorker } from "../../src/mail/outbox-worker.js";
import { RETRY_POLICY } from "../../src/mail/retry-policy.js";
import type { OutgoingMail } from "../../src/ports/mail/mailer.js";
import type {
  ClaimRequest, MailFailure, OutboxRepository, PendingMail,
} from "../../src/ports/mail/outbox-repository.js";
import { MemoryMailSettingsStore } from "../support/memory-mail-settings-store.js";
import { ManualClock } from "../support/test-app.js";

const FEEDBACK: Feedback = {
  id: 42, kind: "bug", status: "new", title: "Git update fails", message: "Exit code 1603.",
  email: "reporter@example.com", installId: null, gupVersion: "0.6.0", platform: "win32",
  locale: "fr", note: "", createdAt: new Date("2026-11-20T10:00:00Z"), updatedAt: new Date(),
};
const MAIL = { smtpUrl: "smtp://unused", from: "gup@example.test", notifyTo: "me@example.test" };
const MINUTE_MS = 60_000;

class OneMailOutbox implements OutboxRepository {
  readonly sent: number[] = [];
  readonly failures: MailFailure[] = [];
  readonly claims: ClaimRequest[] = [];

  constructor(private readonly pending: PendingMail) {}

  async claimDue(request: ClaimRequest): Promise<readonly PendingMail[]> {
    this.claims.push(request);
    return [this.pending];
  }

  async markSent(id: number): Promise<void> {
    this.sent.push(id);
  }

  async markFailed(failure: MailFailure): Promise<void> {
    this.failures.push(failure);
  }
}

function run(
  attempts: number, send: (mail: OutgoingMail) => Promise<void>,
  recipient = new NotifyRecipient(new MemoryMailSettingsStore(), MAIL.notifyTo),
) {
  const outbox = new OneMailOutbox({ id: 7, attempts, feedback: FEEDBACK });
  const clock = new ManualClock();
  const silent = { error: () => undefined, warn: () => undefined };
  const worker = new OutboxWorker({
    outbox, mailer: { send }, recipient, clock, mail: MAIL,
    publicOrigin: "https://feedback.example.test", logger: silent as never,
  });
  return { outbox, clock, done: worker.runOnce() };
}

describe("OutboxWorker", () => {
  it("sends the notification, then marks it sent", async () => {
    const mails: OutgoingMail[] = [];
    const { outbox, done } = run(1, async (mail) => {
      mails.push(mail);
    });
    await done;
    expect(outbox.sent).toEqual([7]);
    expect(mails[0]).toMatchObject({
      to: MAIL.notifyTo,
      replyTo: FEEDBACK.email,
      subject: "[gup] Bug #42 — Git update fails",
    });
    expect(mails[0]?.text).toContain("https://feedback.example.test/admin/feedback/42");
    expect(outbox.claims[0]?.maxAttempts).toBe(8);
  });

  it("sends to the recipient chosen in the back office, read when the mail leaves", async () => {
    const settings = new MemoryMailSettingsStore();
    const recipient = new NotifyRecipient(settings, MAIL.notifyTo);
    await recipient.change("triage@example.test", new Date());
    const mails: OutgoingMail[] = [];
    await run(1, async (mail) => {
      mails.push(mail);
    }, recipient).done;
    expect(mails[0]?.to).toBe("triage@example.test");
  });

  it("retries a failed send later, the wait doubling with each attempt", async () => {
    const { outbox, clock, done } = run(3, async () => {
      throw new Error("connection refused");
    });
    await done;
    const failure = outbox.failures[0];
    expect(failure?.error).toBe("connection refused");
    expect(failure?.retryAt?.getTime()).toBe(clock.now().getTime() + 4 * MINUTE_MS);
  });

  it("gives up after the last attempt", async () => {
    const { outbox, done } = run(RETRY_POLICY.maxAttempts, async () => {
      throw new Error("mailbox full");
    });
    await done;
    expect(outbox.failures[0]?.retryAt).toBeNull();
  });
});

describe("RETRY_POLICY", () => {
  it("starts at one minute and caps the wait", () => {
    expect(RETRY_POLICY.delayAfter(1)).toBe(MINUTE_MS);
    expect(RETRY_POLICY.delayAfter(2)).toBe(2 * MINUTE_MS);
    expect(RETRY_POLICY.delayAfter(30)).toBe(6 * 60 * MINUTE_MS);
  });
});
