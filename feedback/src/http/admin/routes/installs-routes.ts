import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FIELD_RULES } from "../../../domain/field-rules.js";
import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import type { InstallSummary } from "../../../ports/install-reader.js";
import { installPage } from "../../../views/pages/install-page.js";
import { installsPage } from "../../../views/pages/installs-page.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import { HttpError } from "../../http-error.js";
import { HTTP_STATUS } from "../../http-status.js";
import type { AdminContext } from "../admin-context.js";
import { csrfTokenOf } from "../csrf-token-of.js";
import { RequestParams } from "../request-params.js";
import { sendHtml } from "../send-html.js";

const INSTALLS_PAGE_SIZE = 20;
const LOGS_PAGE_SIZE = 50;
const FAILED_UPDATES_SHOWN = 50;
const SCANS_SHOWN = 10;
/** `warn` and above unless asked otherwise: the useful signal for a bug report. */
const { logLevels } = JOURNAL_VOCABULARY;
const DEFAULT_LEVEL_RANK = logLevels.indexOf("warn");

/** Installs that shared journals: the list, one install's journals, erasing one. */
class InstallsEndpoints {
  readonly #context: AdminContext;

  constructor(context: AdminContext) {
    this.#context = context;
  }

  register(app: FastifyInstance): void {
    app.get("/installs", this.list);
    app.get("/installs/:id", this.show);
    app.post("/installs/:id/erase", this.erase);
  }

  readonly list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = new RequestParams(request.query);
    const page = await this.#context.journals.list({
      page: query.page(),
      pageSize: INSTALLS_PAGE_SIZE,
    });
    const notice = query.text("ok");
    return sendHtml(reply, installsPage({ csrfToken: csrfTokenOf(request), page, notice }));
  };

  readonly show = async (request: FastifyRequest, reply: FastifyReply) => {
    const install = await this.#load(request);
    const query = new RequestParams(request.query);
    const level = query.choice("level", logLevels);
    const maxLevelRank = level === null ? DEFAULT_LEVEL_RANK : logLevels.indexOf(level);
    const { journals, feedback } = this.#context;
    const installId = install.id;
    const [failedUpdates, scans, logs, linked] = await Promise.all([
      journals.listHistory({
        installId, kind: "update", status: "failed", page: 1, pageSize: FAILED_UPDATES_SHOWN,
      }),
      journals.listHistory({
        installId, kind: "scan", status: null, page: 1, pageSize: SCANS_SHOWN,
      }),
      journals.listLogs({ installId, maxLevelRank, page: query.page(), pageSize: LOGS_PAGE_SIZE }),
      feedback.listByInstall(installId),
    ]);
    return sendHtml(reply, installPage({
      csrfToken: csrfTokenOf(request), install, installId, feedback: linked,
      failedUpdates, scans, logs, maxLevelRank,
    }));
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
    if (install === null) throw new HttpError(HTTP_STATUS.notFound, "No such install.");
    return install;
  }
}

export function registerInstallsRoutes(app: FastifyInstance, context: AdminContext): void {
  new InstallsEndpoints(context).register(app);
}
