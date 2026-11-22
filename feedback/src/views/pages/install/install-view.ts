import {
  JOURNAL_VOCABULARY, type HistoryKind, type UpdateStatus,
} from "../../../domain/journal.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { href } from "../../kit/href.js";

export interface HistoryFilters {
  /** null = both kinds. */
  readonly kind: HistoryKind | null;
  /** null = any status. */
  readonly status: UpdateStatus | null;
  readonly page: number;
}

export interface LogFilters {
  /** The least verbose level shown: 0 = errors only … 4 = everything. */
  readonly maxLevelRank: number;
  readonly search: string | null;
  readonly page: number;
}

/** Everything an install page's URL says: each section's filters and page. */
export interface InstallView {
  readonly installId: string;
  readonly history: HistoryFilters;
  readonly log: LogFilters;
}

const QUERY = ADMIN_UI.installQuery;
const FIRST_PAGE = 1;
const LIST_PATH = `${ADMIN_UI.home}/installs`;

function pageParam(page: number): number | null {
  return page === FIRST_PAGE ? null : page;
}

function installPath(installId: string): string {
  return `${LIST_PATH}/${installId}`;
}

/** The query parameters of a view; first pages and absent filters are left out. */
function queryOf(view: InstallView): Record<string, string | number | null> {
  return {
    [QUERY.kind]: view.history.kind,
    [QUERY.status]: view.history.status,
    [QUERY.historyPage]: pageParam(view.history.page),
    [QUERY.level]: JOURNAL_VOCABULARY.logLevels[view.log.maxLevelRank] ?? null,
    [QUERY.search]: view.log.search,
    [QUERY.logPage]: pageParam(view.log.page),
  };
}

/** Where the install pages live and link to: every URL carries the whole view. */
export const INSTALL_LINKS = {
  /** The ids of an install page's sections, which links land on. */
  sections: { feedback: "retours", history: "historique", log: "journal" },
  list: LIST_PATH,
  install: installPath,
  /** The install page showing this view, landing on one of its sections. */
  view: (view: InstallView, section: string): string =>
    `${href(installPath(view.installId), queryOf(view))}#${section}`,
  /** The story of one run. A run ID is free text from the client: always encoded. */
  run: (installId: string, runId: string): string =>
    `${installPath(installId)}/runs/${encodeURIComponent(runId)}`,
  export: (installId: string): string => `${installPath(installId)}/export`,
  erase: (installId: string): string => `${installPath(installId)}/erase`,
} as const;
