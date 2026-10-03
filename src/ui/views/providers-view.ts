import type { ProviderStatusReport } from "../../core/platform/types.js";
import type { ViewContext, ViewDefinition } from "../app/view-definition.js";
import { ProvidersPanel } from "../panels/providers-panel.js";
import { VIEW_LABELS } from "../text/menu-labels.js";

/** Where the Providers view gets its report (bounded detection in production). */
export interface ProvidersPort {
  readonly status: () => Promise<ProviderStatusReport>;
}

/**
 * Providers: what this machine has, what it lacks and how to install it, and
 * — greyed, unless the "show incompatible providers" preference is off —
 * what belongs to another OS.
 */
export function providersView(port: ProvidersPort): ViewDefinition {
  return {
    id: "providers",
    label: VIEW_LABELS.providers,
    order: 40,
    group: 1,
    create(context) {
      const panel: ProvidersPanel = new ProvidersPanel(() => void load(panel, port, context), {
        showIncompatible: () => context.preferences().showIncompatibleProviders,
      });
      return panel;
    },
  };
}

/** Detection runs once, the first time the view is shown; a failure shows empty groups. */
async function load(panel: ProvidersPanel, port: ProvidersPort, context: ViewContext) {
  try {
    panel.setData(await port.status());
  } catch {
    panel.setData(emptyReport());
  }
  context.redraw();
}

function emptyReport(): ProviderStatusReport {
  return { platform: process.platform, detected: [], missing: [], incompatible: [] };
}
