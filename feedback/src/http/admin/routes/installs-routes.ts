import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FIELD_RULES } from "../../../domain/field-rules.js";
import type { InstallSummary } from "../../../ports/install-reader.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { installPage } from "../../../views/pages/install/install-page.js";
import { runPage } from "../../../views/pages/install/run-page.js";
import { installsPage } from "../../../views/pages/installs-page.js";
import { HttpError } from "../../http-error.js";
import { HTTP_STATUS } from "../../http-status.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";
import { installExport } from "./install-export.js";
import { readInstallView } from "./install-view-params.js";

const PAGE_SIZES = { installs: 20, history: 50, logs: 50, run: 200 } as const;
const EXPORT_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

function notFound(what: string): never {
  throw new HttpError(HTTP_STATUS.notFound, `No such ${what}.`);
}

/** Installs that shared journals: the list, one install's journals, a run, export, erase. */
class InstallsEndpoints {
  readonly #context: AdminContext;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    app.get("/installs", this.list);
    app.get("/installs/:id", this.show);
    app.get("/installs/:id/runs/:runId", this.showRun);
    app.get("/installs/:id/export", this.download);
    app.post("/installs/:id/erase", this.erase);
  }

  readonly list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = new RequestParams(request.query);
    const page = await this.#context.journals.list({
      page: query.page(),
      pageSize: PAGE_SIZES.installs,
    });
    const notice = query.text("ok");
    return sendHtml(reply, installsPage({ csrfToken: csrfTokenOf(request), page, notice }));
  };

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const install = await this.#load(request);
    const view = readInstallView(install.id, request.query);
    const { journals, feedback, config } = this.#context;
    const installId = install.id;
    const [span, breakdown, history, logs, linked] = await Promise.all([
      journals.journalSpan(installId),
      journals.historyBreakdown(installId),
      journals.listHistory({ installId, ...view.history, pageSize: PAGE_SIZES.history }),
      journals.listLogs({ installId, ...view.log, pageSize: PAGE_SIZES.logs }),
      feedback.listByInstall(installId),
    ]);
    return sendHtml(reply, installPage({
      csrfToken: csrfTokenOf(request), install, span, retentionDays: config.logRetentionDays,
      feedback: linked, view, history, breakdown, logs,
    }));
  };

  readonly showRun = async (request: FastifyRequest, reply: FastifyReply) => {
    const install = await this.#load(request);
    const runId = new RequestParams(request.params).text("runId") ?? "";
    const isWellFormed = runId !== "" && runId.length <= FIELD_RULES.runId.max;
    const key = { installId: install.id, runId };
    const run = isWellFormed ? await this.#context.journals.findRun(key) : null;
    if (run === null) notFound("run");
    const entries = await this.#context.journals.listRun({
      ...key, page: new RequestParams(request.query).page(), pageSize: PAGE_SIZES.run,
    });
    return sendHtml(reply, runPage({ csrfToken: csrfTokenOf(request), run, entries }));
  };

  /** Streamed as the client reads it; `no-store` comes with every back-office response. */
  readonly download = async (request: FastifyRequest, reply: FastifyReply) => {
    const install = await this.#load(request);
    const lines = installExport({
      context: this.#context, install, exportedAt: this.#context.clock.now(),
    });
    return reply
      .type(EXPORT_CONTENT_TYPE)
      .header("Content-Disposition", `attachment; filename="gup-install-${install.id}.jsonl"`)
      .send(Readable.from(lines));
  };

  readonly erase = async (request: FastifyRequest, reply: FastifyReply) => {
    const install = await this.#load(request);
    if (new RequestParams(request.body).text("confirm") !== ADMIN_UI.confirmed) {
      throw new HttpError(HTTP_STATUS.badRequest, "Not confirmed.");
    }
    await this.#context.installs.remove(install.id);
    return reply.redirect(`${ADMIN_UI.home}/installs?ok=erased`, HTTP_STATUS.seeOther);
  };

  async #load(request: FastifyRequest): Promise<InstallSummary> {
    const id = new RequestParams(request.params).text("id")?.toLowerCase() ?? "";
    const isWellFormed = FIELD_RULES.installId.pattern.test(id);
    const install = isWellFormed ? await this.#context.journals.find(id) : null;
    return install ?? notFound("install");
  }
}

export function registerInstallsRoutes(app: FastifyInstance, context: AdminContext): void {
  new InstallsEndpoints(context).register(app);
}
