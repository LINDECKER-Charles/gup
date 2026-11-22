import type { FastifyInstance } from "fastify";
import { FEEDBACK_VOCABULARY, type FeedbackStatus } from "../../../domain/feedback.js";
import { inboxPage } from "../../../views/pages/inbox-page.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const PAGE_SIZE = 20;
const ALL_STATUSES = "all";
/** Triage starts with what nobody has looked at yet. */
const DEFAULT_STATUS: FeedbackStatus = "new";

function readStatus(query: RequestParams): FeedbackStatus | null {
  if (query.text("status") === ALL_STATUSES) return null;
  return query.choice("status", FEEDBACK_VOCABULARY.statuses) ?? DEFAULT_STATUS;
}

export function registerInboxRoutes(app: FastifyInstance, context: AdminContext): void {
  app.get("/", async (request, reply) => {
    const query = new RequestParams(request.query);
    const status = readStatus(query);
    const kind = query.choice("kind", FEEDBACK_VOCABULARY.kinds);
    const [counts, page] = await Promise.all([
      context.feedback.countByStatus(kind),
      context.feedback.list({ status, kind, page: query.page(), pageSize: PAGE_SIZE }),
    ]);
    const notice = query.text("ok");
    return sendHtml(reply, inboxPage({
      csrfToken: csrfTokenOf(request), counts, status, kind, page, notice,
    }));
  });
}
