import type { Density } from "../theme/appearance.js";
import type { Panel } from "../panels/panel.js";
import { QUIT, sidebarEntries, type SidebarEntry, type SidebarLayout } from "./sidebar.js";
import type { ViewContext, ViewDefinition, ViewId } from "./view-definition.js";

/**
 * The views of one menu session: their definitions, the panel each one built,
 * which one is in front, and what they contribute to the sidebar (entries,
 * badges) and the title bar (facts).
 */
export class ViewRegistry {
  /** Sidebar entries: the views by group then order, then "Quitter". */
  readonly entries: readonly SidebarEntry[];
  readonly #definitions: ReadonlyMap<ViewId, ViewDefinition>;
  readonly #panels = new Map<ViewId, Panel>();
  #context: ViewContext | null = null;
  #current: ViewId;

  /** `initialView` comes to the front when registered; the first entry otherwise. */
  constructor(views: readonly ViewDefinition[], initialView: ViewId) {
    this.entries = sidebarEntries(views);
    this.#definitions = new Map(views.map((view) => [view.id, view]));
    const first = this.entries[0]?.id;
    const fallback = first === undefined || first === QUIT ? initialView : first;
    this.#current = this.#definitions.has(initialView) ? initialView : fallback;
  }

  /** Build every view's panel; once, when the context they share exists. */
  mount(context: ViewContext): void {
    this.#context = context;
    for (const [id, view] of this.#definitions) this.#panels.set(id, view.create(context));
  }

  get current(): ViewId {
    return this.#current;
  }

  /** The panel in front (none when no view is registered). */
  get panel(): Panel | undefined {
    return this.#panels.get(this.#current);
  }

  /** Bring a registered view to the front; it hears it when it was not already there. */
  show(view: ViewId): void {
    if (!this.#panels.has(view) || view === this.#current) return;
    this.#current = view;
    this.panel?.onShow?.();
  }

  indexOf(view: ViewId): number {
    return this.entries.findIndex((entry) => entry.id === view);
  }

  /** The entries with their current badges. */
  layout(density: Density): SidebarLayout {
    const entries = this.entries.map((entry) => ({
      ...entry,
      badge: this.definitionOf(entry)?.badge?.(this.context()) ?? null,
    }));
    return { entries, density };
  }

  /** Every view's title-bar facts, in sidebar order. */
  facts(): string[] {
    return this.entries.flatMap((entry) => this.definitionOf(entry)?.facts?.(this.context()) ?? []);
  }

  private definitionOf(entry: SidebarEntry): ViewDefinition | undefined {
    return entry.id === QUIT ? undefined : this.#definitions.get(entry.id);
  }

  private context(): ViewContext {
    if (!this.#context) throw new Error("views read before the session mounted them");
    return this.#context;
  }
}
