import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IssuedMcpAccess } from "../../../auth/mcp-accesses.js";
import { MCP_ACCESS_RULES } from "../../../domain/mcp-access.js";
import type { AdminSession } from "../../../ports/session-repository.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { claudeCodeSetup } from "../../../views/pages/mcp/claude-code-setup.js";
import type { McpAccessForm } from "../../../views/pages/mcp/issue-panel.js";
import { mcpPage } from "../../../views/pages/mcp/mcp-page.js";
import { tokenPage } from "../../../views/pages/mcp/token-page.js";
import { HttpError } from "../../http-error.js";
import { HTTP_STATUS } from "../../http-status.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { BLANK_MCP_ACCESS_FORM, readMcpAccessForm } from "../mcp-access-form.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";
import { TokenReveals } from "../token-reveals.js";

/** What the page shows besides the accesses: the issue form, a notice, its status. */
interface PageView {
  readonly form: McpAccessForm;
  readonly notice: string | null;
  readonly status?: number;
}

/** The guard sets the session on every route it lets through. */
function sessionOf(request: FastifyRequest): AdminSession {
  const session = request.adminSession;
  if (session === null) throw new HttpError(HTTP_STATUS.unauthorized, "Not signed in.");
  return session;
}

/** The accesses to /mcp: the list, issuing one, its token shown once, revoking one. */
class McpEndpoints {
  readonly #context: AdminContext;
  readonly #log: FastifyBaseLogger;
  readonly #reveals: TokenReveals;

  constructor(context: AdminContext, log: FastifyBaseLogger) {
    this.#context = context;
    this.#log = log;
    this.#reveals = new TokenReveals(context.clock, this.#revokeUnseen);
  }

  register(app: FastifyInstance): void {
    app.get("/mcp", this.show);
    app.post("/mcp", this.issue);
    app.get("/mcp/token", this.reveal);
    app.post("/mcp/:id/revoke", this.revoke);
    app.addHook("onClose", () => this.#reveals.clear());
  }

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const notice = new RequestParams(request.query).text("ok");
    return this.#page(request, reply, { form: BLANK_MCP_ACCESS_FORM, notice });
  };

  /** Post/redirect/get: the token goes to the next page, never into a page a reload re-posts. */
  readonly issue = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = readMcpAccessForm(request.body);
    if (!result.isValid) {
      const status = HTTP_STATUS.unprocessableContent;
      return this.#page(request, reply, { form: result.form, notice: null, status });
    }
    const session = sessionOf(request);
    const issued = await this.#context.mcpAccesses.issue(result.request);
    this.#reveals.hold(session, issued);
    request.log.info({ mcpAccessId: issued.access.id }, "MCP access issued");
    return reply.redirect(ADMIN_UI.mcpTokenPath, HTTP_STATUS.seeOther);
  };

  readonly reveal = async (request: FastifyRequest, reply: FastifyReply) => {
    const issued = this.#reveals.take(sessionOf(request));
    if (issued === null) return this.#done(reply, "token-gone");
    return sendHtml(reply, tokenPage({
      csrfToken: csrfTokenOf(request), access: issued.access, token: issued.token,
      setup: claudeCodeSetup(this.#context.config),
    }));
  };

  readonly revoke = async (request: FastifyRequest, reply: FastifyReply) => {
    const id = new RequestParams(request.params).text("id") ?? "";
    if (!MCP_ACCESS_RULES.idPattern.test(id)) {
      throw new HttpError(HTTP_STATUS.notFound, "Not found.");
    }
    if (new RequestParams(request.body).text("confirm") !== ADMIN_UI.confirmed) {
      throw new HttpError(HTTP_STATUS.badRequest, "Not confirmed.");
    }
    const isRevoked = await this.#context.mcpAccesses.revoke(id);
    if (isRevoked) request.log.info({ mcpAccessId: id }, "MCP access revoked");
    return this.#done(reply, isRevoked ? "access-revoked" : "access-inactive");
  };

  /** A token nobody saw opens nothing: its access is revoked rather than left active. */
  readonly #revokeUnseen = async ({ access }: IssuedMcpAccess): Promise<void> => {
    try {
      const isRevoked = await this.#context.mcpAccesses.revoke(access.id);
      if (isRevoked) this.#log.info({ mcpAccessId: access.id }, "MCP access revoked: token unseen");
    } catch (error) {
      this.#log.error({ err: error, mcpAccessId: access.id }, "unseen MCP access not revoked");
    }
  };

  async #page(request: FastifyRequest, reply: FastifyReply, view: PageView) {
    const { mcpAccesses, clock, config } = this.#context;
    return sendHtml(reply, mcpPage({
      csrfToken: csrfTokenOf(request), notice: view.notice, form: view.form,
      accesses: await mcpAccesses.list(), now: clock.now(), setup: claudeCodeSetup(config),
    }), view.status ?? HTTP_STATUS.ok);
  }

  #done(reply: FastifyReply, notice: string): FastifyReply {
    return reply.redirect(`${ADMIN_UI.mcpPath}?ok=${notice}`, HTTP_STATUS.seeOther);
  }
}

export function registerMcpRoutes(app: FastifyInstance, context: AdminContext): void {
  new McpEndpoints(context, app.log).register(app);
}
