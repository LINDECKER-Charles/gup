import type { FeedbackKind, FeedbackStatus } from "../../../domain/feedback.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { href } from "../../kit/href.js";

export interface InboxFilters {
  /** null = every status. */
  readonly status: FeedbackStatus | null;
  readonly kind: FeedbackKind | null;
  readonly search: string | null;
}

/** The inbox's URL for these filters, on page 1 unless told otherwise. */
export function inboxHref(filters: InboxFilters, page = 1): string {
  return href(ADMIN_UI.home, {
    status: filters.status ?? ADMIN_UI.allStatuses, kind: filters.kind, q: filters.search, page,
  });
}
