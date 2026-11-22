import {
  FEEDBACK_VOCABULARY,
  type Feedback, type FeedbackStatus, type NewFeedback, type StatusCounts,
} from "../../src/domain/feedback.js";
import type {
  FeedbackFilter, FeedbackQuery, FeedbackRepository,
} from "../../src/ports/feedback-repository.js";
import type { Page } from "../../src/ports/page.js";

/** The port's search rule, as the SQL adapter applies it. */
function matches(row: Feedback, filter: FeedbackFilter): boolean {
  if (filter.kind !== null && row.kind !== filter.kind) return false;
  if (filter.search === null) return true;
  const needle = filter.search.toLowerCase();
  const fields = [row.title, row.message, row.email ?? "", row.installId ?? ""];
  return fields.some((field) => field.toLowerCase().includes(needle))
    || filter.search.replace(/^#/, "") === String(row.id);
}

export class MemoryFeedbackRepository implements FeedbackRepository {
  readonly rows = new Map<number, Feedback>();
  #nextId = 1;

  async create(feedback: NewFeedback): Promise<number> {
    const id = this.#nextId++;
    const now = new Date();
    this.rows.set(id, { ...feedback, id, status: "new", note: "", createdAt: now, updatedAt: now });
    return id;
  }

  async list(query: FeedbackQuery): Promise<Page<Feedback>> {
    const matching = [...this.rows.values()]
      .filter((row) => query.status === null || row.status === query.status)
      .filter((row) => matches(row, query))
      .reverse();
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matching.slice(start, start + query.pageSize),
      total: matching.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async countByStatus(filter: FeedbackFilter): Promise<StatusCounts> {
    const counts = Object.fromEntries(FEEDBACK_VOCABULARY.statuses.map((status) => [status, 0]));
    for (const row of this.rows.values()) {
      if (matches(row, filter)) counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts as StatusCounts;
  }

  async find(id: number): Promise<Feedback | null> {
    return this.rows.get(id) ?? null;
  }

  async listByInstall(installId: string): Promise<readonly Feedback[]> {
    return [...this.rows.values()].filter((row) => row.installId === installId);
  }

  async updateStatus(id: number, status: FeedbackStatus): Promise<void> {
    this.#patch(id, { status });
  }

  async updateNote(id: number, note: string): Promise<void> {
    this.#patch(id, { note });
  }

  async remove(id: number): Promise<void> {
    this.rows.delete(id);
  }

  #patch(id: number, change: Partial<Feedback>): void {
    const row = this.rows.get(id);
    if (row !== undefined) this.rows.set(id, { ...row, ...change, updatedAt: new Date() });
  }
}
