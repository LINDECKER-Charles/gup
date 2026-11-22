import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../../app-deps.js";
import { FIELD_RULES } from "../../domain/field-rules.js";
import { isLikelyBot } from "../../domain/is-likely-bot.js";
import { validateFeedback } from "../../domain/validate-feedback.js";
import type { HttpFailure } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { apiErrorHandler } from "./api-error-handler.js";
import { sendApiError } from "./api-error.js";
import { FeedbackCors } from "./feedback-cors.js";
import { formRedirectUrl, type FormOutcome } from "./form-redirect.js";
import { DURATION_MS } from "../../time-units.js";

const PATH = "/api/feedback";
const RATE_LIMIT = { max: 5, timeWindow: 10 * DURATION_MS.minute } as const;
/** What a bot is told it created: a success that stores nothing. */
const DROPPED_ID = 0;
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

function isFormRequest(request: FastifyRequest): boolean {
  return request.headers["content-type"]?.startsWith(FORM_CONTENT_TYPE) ?? false;
}

function returnToOf(body: unknown): unknown {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)["returnTo"]
    : undefined;
}

/** `POST /api/feedback`: the landing's script (JSON) and its no-JavaScript form. */
class FeedbackEndpoint {
  readonly #deps: AppDeps;

  constructor(deps: AppDeps) {
    this.#deps = deps;
  }

  register(app: FastifyInstance): void {
    const cors = new FeedbackCors(this.#deps.config.allowedOrigins);
    app.options(PATH, cors.preflight);
    app.post(PATH, {
      bodyLimit: FIELD_RULES.longTextBodyBytes,
      onRequest: cors.decorate,
      // preHandler, not onRequest: a limited form post needs its parsed `returnTo`.
      config: { rateLimit: { ...RATE_LIMIT, hook: "preHandler" } },
      errorHandler: this.handleError,
    }, this.handle);
  }

  readonly handle = async (request: FastifyRequest, reply: FastifyReply) => {
    if (isLikelyBot(request.body, this.#deps.clock.now())) {
      return this.#succeed(request, reply, DROPPED_ID);
    }
    const result = validateFeedback(request.body);
    if (result.ok) {
      return this.#succeed(request, reply, await this.#deps.feedback.create(result.value));
    }
    if (isFormRequest(request)) return this.#redirect(request, reply, "invalid");
    return sendApiError(reply, {
      status: HTTP_STATUS.badRequest,
      error: "invalid",
      message: "Some fields are missing or invalid.",
      details: { fields: result.fields },
    });
  };

  /** A form post is answered with a redirect, so a visitor without JavaScript never sees JSON. */
  readonly handleError = (error: HttpFailure, request: FastifyRequest, reply: FastifyReply) => {
    const status = error.statusCode ?? HTTP_STATUS.internalError;
    if (!isFormRequest(request) || status >= HTTP_STATUS.internalError) {
      return apiErrorHandler(error, request, reply);
    }
    const isLimited = status === HTTP_STATUS.tooManyRequests;
    return this.#redirect(request, reply, isLimited ? "limited" : "invalid");
  };

  #succeed(request: FastifyRequest, reply: FastifyReply, id: number): FastifyReply {
    if (isFormRequest(request)) return this.#redirect(request, reply, "sent");
    return reply.code(HTTP_STATUS.created).send({ id });
  }

  #redirect(request: FastifyRequest, reply: FastifyReply, outcome: FormOutcome): FastifyReply {
    const { allowedOrigins, landingUrl } = this.#deps.config;
    const returnTo = returnToOf(request.body);
    const url = formRedirectUrl({ returnTo, outcome, allowedOrigins, landingUrl });
    return reply.redirect(url, HTTP_STATUS.seeOther);
  }
}

export function registerFeedbackRoute(app: FastifyInstance, deps: AppDeps): void {
  new FeedbackEndpoint(deps).register(app);
}
