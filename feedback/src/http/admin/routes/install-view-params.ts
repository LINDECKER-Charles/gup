import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import { ADMIN_UI } from "../../../views/admin-ui.js";
import type { InstallView } from "../../../views/pages/install/install-view.js";
import { RequestParams } from "../request-params.js";

const { logLevels, historyKinds, updateStatuses } = JOURNAL_VOCABULARY;
const QUERY = ADMIN_UI.installQuery;
/** `warn` and above unless asked otherwise: the useful signal for a bug report. */
const DEFAULT_LEVEL_RANK = logLevels.indexOf("warn");

/** An install page's query string, read leniently: anything unknown falls back to the default. */
export function readInstallView(installId: string, source: unknown): InstallView {
  const query = new RequestParams(source);
  const level = query.choice(QUERY.level, logLevels);
  return {
    installId,
    history: {
      kind: query.choice(QUERY.kind, historyKinds),
      status: query.choice(QUERY.status, updateStatuses),
      page: query.page(QUERY.historyPage),
    },
    log: {
      maxLevelRank: level === null ? DEFAULT_LEVEL_RANK : logLevels.indexOf(level),
      search: query.search(QUERY.search),
      page: query.page(QUERY.logPage),
    },
  };
}
