import type { FastifyInstance } from "fastify";
import { FEEDBACK_VOCABULARY, type FeedbackStatus } from "../../../domain/feedback.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { inboxPage } from "../../../views/pages/inbox/inbox-page.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const PAGE_SIZE = 20;
/** Triage starts with what nobody has looked at yet. */
const DEFAULT_STATUS: FeedbackStatus = "new";

function readStatus(query: RequestParams): FeedbackStatus | null {
  if (query.text("status") === ADMIN_UI.allStatuses) return null;
  return query.choice("status", FEEDBACK_VOCABULARY.statuses) ?? DEFAULT_STATUS;
}

/** Spaces collapsed, cut to the field's limit; nothing left = no search. */
function readSearch(query: RequestParams): string | null {
  const search = (query.text("q") ?? "").replace(/\s+/g, " ").trim()
    .slice(0, ADMIN_UI.maxSearchLength);
  return search === "" ? null : search;
}

export function registerInboxRoutes(app: FastifyInstance, context: AdminContext): void {
  app.get("/", async (request, reply) => {
    const query = new RequestParams(request.query);
    const status = readStatus(query);
    const kind = query.choice("kind", FEEDBACK_VOCABULARY.kinds);
    const filter = { kind, search: readSearch(query) };
    const [counts, page] = await Promise.all([
      context.feedback.countByStatus(filter),
      context.feedback.list({ ...filter, status, page: query.page(), pageSize: PAGE_SIZE }),
    ]);
    return sendHtml(reply, inboxPage({
      csrfToken: csrfTokenOf(request), counts, status, ...filter, page, notice: query.text("ok"),
    }));
  });
}
