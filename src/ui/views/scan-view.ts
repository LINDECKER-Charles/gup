import type { ViewDefinition } from "../app/view-definition.js";
import { ScanPanel } from "../panels/scan-panel.js";
import { VIEW_LABELS } from "../text/menu-labels.js";

/** Scan: live progress of the session's scans, then the result per provider. */
export function scanView(): ViewDefinition {
  return {
    id: "scan",
    label: VIEW_LABELS.scan,
    order: 10,
    group: 0,
    create(context) {
      const panel = new ScanPanel(() => context.rescan());
      context.observeScan(panel);
      return panel;
    },
  };
}
