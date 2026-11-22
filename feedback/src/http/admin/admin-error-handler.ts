import type { FastifyReply, FastifyRequest } from "fastify";
import { errorPage } from "../../views/pages/error-page.js";
import { loginPage } from "../../views/pages/login-page.js";
import type { HttpFailure } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { sendHtml } from "./send-html.js";

const INTERNAL_ERROR = HTTP_STATUS.internalError;

const PAGES: Readonly<Record<number, { title: string; message: string }>> = {
  400: { title: "Requête invalide", message: "La requête est mal formée." },
  403: {
    title: "Requête refusée",
    message: "Ce formulaire a expiré ou ne vient pas du back office. Rechargez la page "
      + "et réessayez.",
  },
  404: { title: "Page introuvable", message: "Cette page n’existe pas ou a été supprimée." },
  413: { title: "Envoi trop volumineux", message: "Le formulaire envoyé est trop long." },
  [INTERNAL_ERROR]: {
    title: "Erreur interne",
    message: "Une erreur inattendue est survenue. Réessayez dans un instant.",
  },
};

function renderError(request: FastifyRequest, reply: FastifyReply, status: number) {
  const page = PAGES[status] ?? PAGES[INTERNAL_ERROR] ?? { title: "", message: "" };
  const session = request.adminSession;
  const signedIn = session === null ? undefined : { csrfToken: session.csrfToken, section: null };
  return sendHtml(reply, errorPage({ ...page, ...(signedIn && { signedIn }) }), status);
}

/** Errors of the back office, as French HTML pages; internals are logged, never shown. */
export function adminErrorHandler(
  error: HttpFailure,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const status = error.statusCode ?? INTERNAL_ERROR;
  if (status === HTTP_STATUS.tooManyRequests) {
    const message = "Trop de tentatives de connexion. Réessayez dans quelques minutes.";
    return sendHtml(reply, loginPage({ error: message, username: "" }), status);
  }
  if (status >= INTERNAL_ERROR) request.log.error({ err: error }, "admin request failed");
  if (PAGES[status] !== undefined) return renderError(request, reply, status);
  const fallback = status < INTERNAL_ERROR ? HTTP_STATUS.badRequest : INTERNAL_ERROR;
  return renderError(request, reply, fallback);
}
