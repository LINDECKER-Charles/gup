import { readProviderStatus } from "../core/platform/provider-status.js";
import type { ViewDefinition } from "../ui/app/view-definition.js";
import { journalOptions } from "../ui/settings/journal-options.js";
import { journalView } from "../ui/views/journal-view.js";
import { optionsView } from "../ui/views/options-view.js";
import { packagesView } from "../ui/views/packages-view.js";
import { providersView } from "../ui/views/providers-view.js";
import { scanView } from "../ui/views/scan-view.js";
import { schedulesView } from "../ui/views/schedules-view.js";
import { journalSource } from "./journal/journal-source.js";
import { currentLogLevel } from "./journal/log-session.js";
import { menuSchedules } from "./schedule/schedules-controller.js";

/**
 * Composition root of the interactive menu: every view, one line each, sorted
 * by module name (the sidebar orders them by their own group and order). A
 * feature adds its view here and nowhere else; the ports between features
 * (the journal's Options rows) are wired here too.
 */
export function menuViews(): readonly ViewDefinition[] {
  return [
    journalView(journalSource),
    optionsView({ extraSections: [journalOptions({ logLevel: currentLogLevel })] }),
    packagesView(),
    providersView({ status: readProviderStatus }),
    scanView(),
    schedulesView(menuSchedules()),
  ];
}
