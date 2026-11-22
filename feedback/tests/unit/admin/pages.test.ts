import { describe, expect, it } from "vitest";
import type { Feedback } from "../../../src/domain/feedback.js";
import type {
  InstallSummary, StoredHistoryRecord, StoredLogRecord,
} from "../../../src/ports/install-reader.js";
import type { Page } from "../../../src/ports/page.js";
import { feedbackPage } from "../../../src/views/pages/feedback-page.js";
import { installPage } from "../../../src/views/pages/install/install-page.js";
import { runPage } from "../../../src/views/pages/install/run-page.js";
import { mailsPage } from "../../../src/views/pages/mails/mails-page.js";

/** Breaks out of an attribute, then out of the text: whatever the context, it must stay text. */
const HOSTILE = `"'><script>alert(1)</script><img src=x onerror=alert(2)>`;
const INSTALL_ID = "8c1d4f2e-3b5a-4c6d-8e7f-9a0b1c2d3e4f";
const AT = new Date("2026-11-20T08:00:00.000Z");

function pageOf<T>(items: readonly T[]): Page<T> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

/** Whether the markup holds any element or attribute an attacker injected. */
function expectInert(markup: string): void {
  expect(markup).not.toContain("<script");
  expect(markup).not.toContain("<img src=x");
  // Quoted attribute values are inert: an injected attribute would sit outside the quotes.
  expect(markup.replace(/"[^"]*"/g, `""`)).not.toMatch(/<[a-z][^>]*\sonerror=/i);
  expect(markup).not.toMatch(/href="javascript:/i);
}

const FEEDBACK: Feedback = {
  id: 7, kind: "bug", status: "new", title: HOSTILE, message: `${HOSTILE}\nsecond line`,
  email: "javascript:alert(1)//@example.com", installId: INSTALL_ID,
  gupVersion: "0.6.0", platform: "win32", locale: "fr", note: HOSTILE,
  createdAt: AT, updatedAt: AT,
};

describe("feedback page", () => {
  const markup = feedbackPage({
    csrfToken: `tok"en`, feedback: FEEDBACK, hasSharedJournals: true, notice: HOSTILE,
  });

  it("escapes every reporter-supplied field", () => {
    expectInert(markup);
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).toContain(`value="tok&quot;en"`);
  });

  it("keeps a hostile address inside a mailto link, encoded", () => {
    expect(markup).toContain(`href="mailto:javascript%3Aalert(1)%2F%2F@example.com?subject=`);
  });
});

describe("install page", () => {
  const install: InstallSummary = {
    id: INSTALL_ID, gupVersion: HOSTILE, platform: HOSTILE, arch: HOSTILE, node: HOSTILE,
    locale: HOSTILE, firstSeenAt: AT, lastSeenAt: AT, historyCount: 1, logCount: 1,
    feedbackCount: 1,
  };
  const failed: StoredHistoryRecord = {
    id: 1, ts: AT, runId: HOSTILE, kind: "update", status: "failed",
    data: { providerId: HOSTILE, packageId: HOSTILE, from: HOSTILE, to: HOSTILE, message: HOSTILE },
  };
  const scan: StoredHistoryRecord = {
    id: 2, ts: AT, runId: HOSTILE, kind: "scan", status: null,
    data: { durationMs: 1500, outdated: HOSTILE, providers: [{ error: HOSTILE }] },
  };
  const log: StoredLogRecord = {
    id: 3, ts: AT, runId: HOSTILE, levelRank: 0, event: HOSTILE,
    data: { ctx: { [HOSTILE]: HOSTILE }, data: HOSTILE },
  };
  const markup = installPage({
    csrfToken: "token", install, feedback: [FEEDBACK],
    span: { oldestAt: AT, newestAt: AT, oldestReceivedAt: AT, runCount: 1 },
    retentionDays: 90,
    view: {
      installId: INSTALL_ID,
      history: { kind: null, status: null, page: 1 },
      log: { maxLevelRank: 4, search: HOSTILE, page: 1 },
    },
    history: pageOf([failed, scan]),
    breakdown: [{ kind: "update", status: "failed", count: 1 }],
    logs: pageOf([log]),
  });
  const runMarkup = runPage({
    csrfToken: "token",
    run: {
      installId: INSTALL_ID, runId: HOSTILE, startedAt: AT, endedAt: AT,
      historyCount: 2, logCount: 1, errorCount: 1, failedUpdateCount: 1,
    },
    entries: pageOf([
      { source: "history", record: failed },
      { source: "history", record: scan },
      { source: "log", record: log },
    ]),
  });

  it("escapes uploaded records, their keys and the install's metadata", () => {
    expectInert(markup);
    expect(markup).toContain("&lt;img src=x onerror=alert(2)&gt;");
  });

  it("still renders the records it escaped", () => {
    expect(markup.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("shows each record's whole data, pretty-printed and escaped", () => {
    expect(markup).toContain("Données complètes");
    expect(markup).toContain("&quot;providerId&quot;: &quot;\\&quot;&#39;&gt;&lt;script&gt;");
  });

  it("links a run by its encoded ID and keeps the search in the form, escaped", () => {
    expect(markup).toContain(`/runs/${encodeURIComponent(HOSTILE).replaceAll("'", "&#39;")}"`);
    expect(markup).toContain(`value="&quot;&#39;&gt;&lt;script&gt;`);
  });

  it("escapes a run's ID and every record of its story", () => {
    expectInert(runMarkup);
    expect(runMarkup.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(6);
  });
});

describe("mails page", () => {
  const markup = mailsPage({
    csrfToken: "token", notice: null, pollIntervalMs: 5_000, maxAttempts: 8,
    relay: {
      endpoint: { host: HOSTILE, port: 465, isDefaultPort: true, isImplicitTls: true },
      from: HOSTILE, to: HOSTILE,
    },
    lastTest: { at: AT, to: HOSTILE, error: HOSTILE },
    testLimit: { max: 5, windowMs: 600_000 },
    counts: { waiting: 1, failing: 1, sentRecently: 0 },
    unsent: pageOf([{
      id: 1, feedbackId: 7, feedbackKind: "bug", feedbackTitle: HOSTILE, attempts: 3,
      nextAttemptAt: AT, lastError: HOSTILE, createdAt: AT,
    }]),
    sentWindowDays: 30,
  });

  it("escapes the relay settings, the last test error and the outbox", () => {
    expectInert(markup);
    expect(markup.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
