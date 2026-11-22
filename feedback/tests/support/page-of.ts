import type { Page, PageRequest } from "../../src/ports/page.js";

/** One page of an in-memory list, as the Postgres adapters cut it. */
export function pageOf<T>(items: readonly T[], request: PageRequest): Page<T> {
  const start = (request.page - 1) * request.pageSize;
  return {
    items: items.slice(start, start + request.pageSize),
    total: items.length,
    page: request.page,
    pageSize: request.pageSize,
  };
}
