/**
 * Cursor over a list in which some rows (separators, disabled entries) cannot
 * be selected. Moves skip them and stop at either end rather than wrapping:
 * on a long package list, wrapping turns one keypress too many into a jump to
 * the other end.
 */
export class ListCursor {
  #index: number;

  constructor(
    private readonly selectable: readonly boolean[],
    initial = 0,
  ) {
    this.#index = this.nearestSelectable(initial);
  }

  /** Current row, or -1 when no row can be selected. */
  get index(): number {
    return this.#index;
  }

  move(delta: number): void {
    const step = Math.sign(delta);
    for (let remaining = Math.abs(delta); remaining > 0; remaining--) {
      const next = this.nextSelectable(this.#index + step, step);
      if (next === -1) return;
      this.#index = next;
    }
  }

  /** The list navigation keys every list prompt shares, by key name. */
  keyBindings(pageSize: number): Record<string, () => void> {
    return {
      up: () => this.move(-1),
      k: () => this.move(-1),
      down: () => this.move(1),
      j: () => this.move(1),
      pageup: () => this.move(-pageSize),
      pagedown: () => this.move(pageSize),
    };
  }

  /** Rows to draw so that the cursor stays in view. */
  window(pageSize: number): { start: number; end: number } {
    const total = this.selectable.length;
    if (total <= pageSize) return { start: 0, end: total };
    const centered = this.#index - Math.floor(pageSize / 2);
    const start = Math.min(Math.max(0, centered), total - pageSize);
    return { start, end: start + pageSize };
  }

  private nextSelectable(from: number, step: number): number {
    for (let i = from; i >= 0 && i < this.selectable.length; i += step) {
      if (this.selectable[i]) return i;
    }
    return -1;
  }

  private nearestSelectable(from: number): number {
    const forward = this.nextSelectable(Math.max(0, from), 1);
    return forward !== -1 ? forward : this.nextSelectable(from - 1, -1);
  }
}
