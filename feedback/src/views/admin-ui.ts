/**
 * What the back office's routes and its pages must agree on: where it lives,
 * the names of its form fields and the limits a form announces.
 */
export const ADMIN_UI = {
  home: "/admin",
  loginPath: "/admin/login",
  /** The hidden field of every form that carries the session's CSRF token. */
  csrfField: "_csrf",
  /** The value of a ticked confirmation box. */
  confirmed: "yes",
  maxNoteLength: 5000,
} as const;
