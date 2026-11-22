import type { ViewDefinition } from "../app/view-definition.js";
import { FeedbackPanel, type FeedbackPanelPort } from "../panels/feedback-panel.js";
import { FEEDBACK_MENU_LABELS } from "../text/feedback/feedback-menu-labels.js";

/** What the view needs from the feedback feature; the menu supplies the clipboard and redraws. */
export type FeedbackPort = Pick<
  FeedbackPanelPort,
  "installId" | "createInstallId" | "formUrl" | "openForm"
>;

/** Feedback, between the Journal and Options: report a bug or suggest an idea. */
export function feedbackView(port: FeedbackPort): ViewDefinition {
  return {
    id: "feedback",
    label: FEEDBACK_MENU_LABELS.view,
    order: 55,
    group: 1,
    create: (context) =>
      new FeedbackPanel({
        installId: () => port.installId(),
        createInstallId: () => port.createInstallId(),
        formUrl: (installId) => port.formUrl(installId),
        openForm: (url) => port.openForm(url),
        copy: (text) => context.screen.renderer.copyToClipboardOSC52(text),
        redraw: () => context.redraw(),
      }),
  };
}
