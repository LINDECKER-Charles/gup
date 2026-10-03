import type { ViewDefinition } from "../app/view-definition.js";
import { JournalPanel } from "../panels/journal/journal-panel.js";
import type { JournalSource } from "../panels/journal/journal-source.js";
import { JOURNAL_LABELS } from "../text/journal-labels.js";

/**
 * Journal: the activity of a period — at a glance, per package, event by
 * event — and the debug log, read when the view comes to the front. The
 * source (history, log, exports) is the composition root's.
 */
export function journalView(source: JournalSource): ViewDefinition {
  return {
    id: "journal",
    label: JOURNAL_LABELS.view,
    order: 50,
    group: 1,
    create: (context) =>
      new JournalPanel({
        source,
        redraw: () => context.redraw(),
        choose: (spec) => context.dialogs.choose(spec),
        glyphMode: () => context.screen.appearance.glyphMode,
      }),
  };
}
