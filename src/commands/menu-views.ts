import { openWebPage } from "../core/export/open-external.js";
import { readProviderStatus } from "../core/platform/provider-status.js";
import type { ViewDefinition } from "../ui/app/view-definition.js";
import { journalOptions } from "../ui/settings/journal-options.js";
import { sharingOptions } from "../ui/settings/sharing-options.js";
import { feedbackView } from "../ui/views/feedback-view.js";
import { journalView } from "../ui/views/journal-view.js";
import { optionsView } from "../ui/views/options-view.js";
import { packagesView } from "../ui/views/packages-view.js";
import { providersView } from "../ui/views/providers-view.js";
import { scanView } from "../ui/views/scan-view.js";
import { schedulesView } from "../ui/views/schedules-view.js";
import { processSharing } from "./feedback/process-sharing.js";
import { journalSource } from "./journal/journal-source.js";
import { currentLogLevel } from "./journal/log-session.js";
import { menuSchedules } from "./schedule/schedules-controller.js";

/**
 * Composition root of the interactive menu: every view, one line each, sorted
 * by module name (the sidebar orders them by their own group and order). A
 * feature adds its view here and nowhere else; the ports between features
 * (the journal's schedule names, its Options rows) are wired here too.
 */
export function menuViews(): readonly ViewDefinition[] {
  const schedules = menuSchedules();
  // The process's own: the erasure the Options row starts is awaited before the process exits.
  const sharing = processSharing();
  return [
    feedbackView({
      installId: () => sharing.installId(),
      createInstallId: () => sharing.createInstallId(),
      formUrl: (installId) => sharing.formUrl(installId),
      openForm: async (url) => (await openWebPage(url)).opened,
    }),
    journalView(journalSource, { scheduleName: (id) => schedules.scheduleName(id) }),
    optionsView({
      extraSections: [journalOptions({ logLevel: currentLogLevel }), sharingOptions(sharing)],
    }),
    packagesView(),
    providersView({ status: readProviderStatus }),
    scanView(),
    schedulesView(schedules),
  ];
}
