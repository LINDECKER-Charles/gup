import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FEEDBACK_VOCABULARY, type Feedback } from "../../../domain/feedback.js";
import { FIELD_RULES } from "../../../domain/field-rules.js";
import { isPlainText } from "../../../security/is-plain-text.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { feedbackPage } from "../../../views/pages/feedback-page.js";
import { HttpError } from "../../http-error.js";
import { HTTP_STATUS } from "../../http-status.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const { seeOther: SEE_OTHER } = HTTP_STATUS;

function invalid(message: string): never {
  throw new HttpError(HTTP_STATUS.badRequest, message);
}

/** One feedback: read it, triage it, annotate it, delete it. */
class FeedbackEndpoints {
  readonly #context: AdminContext;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    app.get("/feedback/:id", this.show);
    app.post("/feedback/:id/status", this.changeStatus);
    app.post("/feedback/:id/note", { bodyLimit: FIELD_RULES.longTextBodyBytes }, this.saveNote);
    app.post("/feedback/:id/delete", this.remove);
  }

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const feedback = await this.#load(request);
    const { installId } = feedback;
    const install = installId === null ? null : await this.#context.journals.find(installId);
    return sendHtml(reply, feedbackPage({
      csrfToken: csrfTokenOf(request),
      feedback,
      hasSharedJournals: install !== null,
      notice: new RequestParams(request.query).text("ok"),
    }));
  };

  readonly changeStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const feedback = await this.#load(request);
    const status = new RequestParams(request.body).choice("status", FEEDBACK_VOCABULARY.statuses);
    if (status === null) invalid("Unknown status.");
    await this.#context.feedback.updateStatus(feedback.id, status);
    return reply.redirect(`/admin/feedback/${feedback.id}?ok=status`, SEE_OTHER);
  };

  readonly saveNote = async (request: FastifyRequest, reply: FastifyReply) => {
    const feedback = await this.#load(request);
    const note = new RequestParams(request.body).text("note") ?? "";
    if (note.length > ADMIN_UI.maxNoteLength) invalid("Note too long.");
    if (!isPlainText(note)) invalid("Note holds control characters.");
    await this.#context.feedback.updateNote(feedback.id, note.trim());
    return reply.redirect(`/admin/feedback/${feedback.id}?ok=note`, SEE_OTHER);
  };

  readonly remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const feedback = await this.#load(request);
    const isConfirmed = new RequestParams(request.body).text("confirm") === ADMIN_UI.confirmed;
    if (!isConfirmed) invalid("Not confirmed.");
    await this.#context.feedback.remove(feedback.id);
    return reply.redirect(`${ADMIN_UI.home}?status=all&ok=deleted`, SEE_OTHER);
  };

  async #load(request: FastifyRequest): Promise<Feedback> {
    const id = new RequestParams(request.params).positiveInteger("id");
    const feedback = id === null ? null : await this.#context.feedback.find(id);
    if (feedback === null) throw new HttpError(HTTP_STATUS.notFound, "No such feedback.");
    return feedback;
  }
}

export function registerFeedbackRoutes(app: FastifyInstance, context: AdminContext): void {
  new FeedbackEndpoints(context).register(app);
}
