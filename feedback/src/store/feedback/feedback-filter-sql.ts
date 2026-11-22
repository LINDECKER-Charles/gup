import type { FeedbackStatus } from "../../domain/feedback.js";
import type { FeedbackFilter } from "../../ports/feedback-repository.js";

/** `42` or `#42`: a search that may also be a feedback's number. */
const FEEDBACK_NUMBER = /^#?(\d{1,15})$/;

/**
 * The inbox's WHERE clause: `$1` status, `$2` kind, `$3` LIKE pattern, `$4`
 * feedback number; each null lifts its constraint. The search scans the
 * table, which an inbox of a few thousand rows answers at once; a pg_trgm
 * index is the step after.
 */
export const FEEDBACK_FILTER = `($1::text IS NULL OR f.status = $1)
  AND ($2::text IS NULL OR f.kind = $2)
  AND ($3::text IS NULL OR f.title ILIKE $3 OR f.message ILIKE $3 OR f.email ILIKE $3
    OR f.install_id::text ILIKE $3 OR f.id = $4::bigint)`;

/** `%`, `_` and the escape character itself match literally. */
function containing(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The four parameters of FEEDBACK_FILTER, in order. */
export function feedbackFilterParams(
  status: FeedbackStatus | null,
  filter: FeedbackFilter,
): readonly unknown[] {
  if (filter.search === null) return [status, filter.kind, null, null];
  const number = FEEDBACK_NUMBER.exec(filter.search)?.[1] ?? null;
  return [status, filter.kind, containing(filter.search), number];
}
