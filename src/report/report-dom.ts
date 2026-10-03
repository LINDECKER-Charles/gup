/**
 * The contract between the report's static markup (`html-shell.ts`) and its
 * client script: element ids and page names, declared once and handed to the
 * client as constants, so the two sides cannot drift apart.
 */

export const REPORT_IDS = {
  data: "gup-report-data",
  labels: "gup-report-labels",
  main: "main",
  search: "search",
  period: "report-period",
  banner: "banner",
  live: "live",
  tooltip: "tooltip",
  print: "print",
  generated: "generated",
  readNotes: "read-notes",
  drawer: "drawer",
  drawerTitle: "drawer-title",
  drawerProvider: "drawer-provider",
  drawerBody: "drawer-body",
  drawerClose: "drawer-close",
  drawerCopy: "drawer-copy",
  dayDetail: "day-detail",
  packagesCount: "packages-count",
  packagesSearch: "packages-search",
  packagesBody: "packages-body",
  packagesMore: "packages-more",
  failuresList: "failures-list",
  failuresMore: "failures-more",
  sessionsCount: "sessions-count",
  sessionsDay: "sessions-day",
  sessionsList: "sessions-list",
  sessionsMore: "sessions-more",
} as const;

/** The report's pages, in navigation order; the first is the default route. */
export const REPORT_PAGES = ["overview", "calendar", "packages", "failures", "sessions"] as const;
export type ReportPage = (typeof REPORT_PAGES)[number];

/** Pages whose navigation entry shows a count. */
export const COUNTED_PAGES: ReadonlySet<ReportPage> = new Set(["packages", "failures", "sessions"]);
