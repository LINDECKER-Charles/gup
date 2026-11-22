/**
 * What the back office's routes and its pages must agree on: where it lives,
 * the names of its form fields and the limits a form announces.
 */
export const ADMIN_UI = {
  home: "/admin",
  loginPath: "/admin/login",
  /** The second step of a login: the authenticator app's code. */
  codePath: "/admin/login/code",
  assetsPath: "/admin/assets",
  mailsPath: "/admin/mails",
  /** The inbox's `status` value that lifts the status filter. */
  allStatuses: "all",
  /** The hidden field of every form that carries the session's CSRF token. */
  csrfField: "_csrf",
  /** The value of a ticked confirmation box. */
  confirmed: "yes",
  maxNoteLength: 5000,
  /** Longer searches are cut: nobody types more to find a feedback or a log line. */
  maxSearchLength: 100,
  /**
   * Query parameters of an install page. The history and the log filter and
   * page apart, so moving through one never resets the other.
   */
  installQuery: {
    kind: "kind",
    status: "status",
    historyPage: "hpage",
    level: "level",
    search: "q",
    logPage: "lpage",
  },
} as const;
