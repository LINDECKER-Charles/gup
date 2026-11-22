import { afterEach, describe, expect, it } from "vitest";
import type { MailConfig } from "../../../src/config/app-config.js";
import type { UnsentMail } from "../../../src/ports/mail/outbox-monitor.js";
import { AdminSession } from "../../support/admin-session.js";
import { RecordingMailer } from "../../support/recording-mailer.js";
import { createTestApp, testConfig, type TestApp } from "../../support/test-app.js";

const MAILS = "/admin/mails";
const HOSTILE = `"'><script>alert(1)</script>`;
const MAIL: MailConfig = {
  smtpUrl: "smtps://relay-user:relay-pa55word@smtp.example.test",
  from: "feedback@example.test",
  notifyTo: "maintainer@example.test",
};
const UNSENT: UnsentMail = {
  id: 1, feedbackId: 7, feedbackKind: "bug", feedbackTitle: HOSTILE, attempts: 0,
  nextAttemptAt: new Date("2026-11-20T09:00:00.000Z"), lastError: null,
  createdAt: new Date("2026-11-20T08:00:00.000Z"),
};

let ctx: TestApp;

afterEach(async () => {
  await ctx.app.close();
});

async function open(options: { mailer?: RecordingMailer } = {}): Promise<AdminSession> {
  const mailer = options.mailer ?? null;
  ctx = await createTestApp({
    config: testConfig({ mail: mailer === null ? null : MAIL }),
    mailer,
  });
  return AdminSession.open(ctx.app);
}

function noticeOf(response: { headers: Record<string, unknown> }): string | null {
  const location = String(response.headers["location"] ?? "");
  return new URL(location, "http://x").searchParams.get("ok");
}

describe("mails page", () => {
  it("is in the navigation and says when the relay is not configured", async () => {
    const admin = await open();
    const body = (await admin.get(MAILS)).body;
    expect(body).toMatch(/href="\/admin\/mails"[^>]*aria-current="page"/);
    expect(body).toContain("Non configuré : les mails attendent dans la file.");
  });

  it("shows host, port and TLS of the relay, never its user or password", async () => {
    const admin = await open({ mailer: new RecordingMailer() });
    const body = (await admin.get(MAILS)).body;
    expect(body).toContain("smtp.example.test");
    expect(body).toContain("465 (par défaut)");
    expect(body).toContain("Implicite (smtps)");
    expect(body).toContain("maintainer@example.test");
    expect(body).not.toContain("relay-user");
    expect(body).not.toContain("relay-pa55word");
  });

  it("counts the outbox and lists unsent mails with their feedback, errors escaped", async () => {
    const admin = await open();
    ctx.outbox.sentRecently = 12;
    ctx.outbox.unsent = [
      UNSENT,
      { ...UNSENT, id: 2, feedbackId: 8, attempts: 8, lastError: `${HOSTILE} ${"e".repeat(400)}` },
    ];
    const body = (await admin.get(MAILS)).body;
    expect(body).toMatch(/En attente<\/dt>\s*<dd class="stat__value">1</);
    expect(body).toMatch(/En échec<\/dt>\s*<dd class="stat__value">1</);
    expect(body).toMatch(/Envoyés \(30 j\)<\/dt>\s*<dd class="stat__value">12</);
    expect(body).toContain(`href="/admin/feedback/8"`);
    expect(body).toContain("8 / 8");
    expect(body).toContain("abandonné");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("e".repeat(300));
    expect(ctx.outbox.countQueries[0]).toEqual(new Date("2026-10-21T10:00:00.000Z"));
  });

  it("says the outbox is empty when nothing waits", async () => {
    const admin = await open();
    expect((await admin.get(MAILS)).body).toContain("Aucun mail en attente.");
  });
});

describe("test mail", () => {
  it("sends a plain mail to the recipient through the relay and says so", async () => {
    const mailer = new RecordingMailer();
    const admin = await open({ mailer });
    const response = await admin.post(`${MAILS}/test`);
    expect(response.statusCode).toBe(303);
    expect(noticeOf(response)).toBe("test-sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: MAIL.notifyTo, from: MAIL.from });
    const page = (await admin.get(`${MAILS}?ok=test-sent`)).body;
    expect(page).toContain("accepté par le relais");
  });

  it("reports the relay's error, escaped", async () => {
    const mailer = new RecordingMailer();
    mailer.failure = new Error(`535 auth failed ${HOSTILE}`);
    const admin = await open({ mailer });
    const response = await admin.post(`${MAILS}/test`);
    expect(noticeOf(response)).toBe("test-failed");
    const page = (await admin.get(`${MAILS}?ok=test-failed`)).body;
    expect(page).toContain("role=\"alert\"");
    expect(page).toContain("535 auth failed &quot;&#39;&gt;&lt;script&gt;");
    expect(page).not.toContain("<script>");
  });

  it("refuses with a notice when SMTP is not configured", async () => {
    const admin = await open();
    expect(noticeOf(await admin.post(`${MAILS}/test`))).toBe("test-unconfigured");
  });

  it("allows 5 tests per 10 minutes, then refuses with a notice", async () => {
    const mailer = new RecordingMailer();
    const admin = await open({ mailer });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(noticeOf(await admin.post(`${MAILS}/test`))).toBe("test-sent");
    }
    expect(noticeOf(await admin.post(`${MAILS}/test`))).toBe("test-limited");
    expect(mailer.sent).toHaveLength(5);
  });

  it("refuses a post without the CSRF token", async () => {
    const mailer = new RecordingMailer();
    const admin = await open({ mailer });
    const response = await admin.post(`${MAILS}/test`, { _csrf: "forged" });
    expect(response.statusCode).toBe(403);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("retry now", () => {
  it("makes every unsent mail due now, a given-up one getting one more attempt", async () => {
    const admin = await open({ mailer: new RecordingMailer() });
    ctx.outbox.unsent = [UNSENT, { ...UNSENT, id: 2, attempts: 8 }];
    const response = await admin.post(`${MAILS}/retry`);
    expect(noticeOf(response)).toBe("retried");
    expect(ctx.outbox.unsent.map((mail) => mail.attempts)).toEqual([0, 7]);
    expect(ctx.outbox.unsent[0]?.nextAttemptAt).toEqual(ctx.clock.now());
  });

  it("says when nothing waits, and when there is no relay to retry through", async () => {
    expect(noticeOf(await (await open({ mailer: new RecordingMailer() }))
      .post(`${MAILS}/retry`))).toBe("retry-none");
    await ctx.app.close();
    expect(noticeOf(await (await open()).post(`${MAILS}/retry`))).toBe("retry-unconfigured");
  });

  it("refuses a post without the CSRF token", async () => {
    const admin = await open({ mailer: new RecordingMailer() });
    ctx.outbox.unsent = [{ ...UNSENT, attempts: 3 }];
    expect((await admin.post(`${MAILS}/retry`, { _csrf: "" })).statusCode).toBe(403);
    expect(ctx.outbox.unsent[0]?.attempts).toBe(3);
  });
});
