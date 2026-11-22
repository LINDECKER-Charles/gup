import { describe, expect, it } from "vitest";
import type { Feedback } from "../../../src/domain/feedback.js";
import type {
  InstallSummary, StoredHistoryRecord, StoredLogRecord,
} from "../../../src/ports/install-reader.js";
import type { Page } from "../../../src/ports/page.js";
import { feedbackPage } from "../../../src/views/pages/feedback-page.js";
import { installPage } from "../../../src/views/pages/install-page.js";

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
  expect(markup).not.toMatch(/<[a-z][^>]*\sonerror=/i);
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
    csrfToken: "token", install, installId: INSTALL_ID, feedback: [FEEDBACK],
    failedUpdates: pageOf([failed]), scans: pageOf([scan]), logs: pageOf([log]), maxLevelRank: 4,
  });

  it("escapes uploaded records, their keys and the install's metadata", () => {
    expectInert(markup);
    expect(markup).toContain("&lt;img src=x onerror=alert(2)&gt;");
  });

  it("still renders the records it escaped", () => {
    expect(markup.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(8);
  });
});
