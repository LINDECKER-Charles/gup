import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../core/runner.js";
import type { ViewContext, ViewDefinition } from "../app/view-definition.js";
import { OptionsPanel } from "../panels/options-panel.js";
import { scanModeFact, TIMEOUT_DIALOG, VIEW_LABELS } from "../text/menu-labels.js";

/** Options: scan mode, provider filter and install timeout of the session. */
export function optionsView(): ViewDefinition {
  return {
    id: "options",
    label: VIEW_LABELS.options,
    order: 60,
    group: 1,
    create: (context) =>
      new OptionsPanel(context.state, {
        onEditTimeout: () => void editTimeout(context),
        onRescan: () => context.rescan(),
      }),
    facts: ({ state }) => [scanModeFact(state.fast, state.filter.length)],
  };
}

async function editTimeout(context: ViewContext): Promise<void> {
  const value = await context.dialogs.ask({
    title: TIMEOUT_DIALOG.title,
    text: [TIMEOUT_DIALOG.text],
    default: String(getInstallTimeoutSeconds()),
    validate: (v) =>
      (v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) || TIMEOUT_DIALOG.invalid,
  });
  if (value !== undefined) setInstallTimeoutSeconds(Number(value));
  context.redraw();
}
