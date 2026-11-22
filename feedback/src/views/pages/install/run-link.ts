import { html, type SafeHtml } from "../../kit/html.js";
import { INSTALL_LINKS } from "./install-view.js";

/** The head of a UUID tells runs apart at a glance; the link's name carries it whole. */
const SHORT_RUN_LENGTH = 8;

/** The way into the run a record belongs to. */
export function runLink(installId: string, runId: string): SafeHtml {
  const short = runId.length > SHORT_RUN_LENGTH ? `${runId.slice(0, SHORT_RUN_LENGTH)}…` : runId;
  return html`<a class="run-link" href="${INSTALL_LINKS.run(installId, runId)}"
    aria-label="Exécution ${runId}">${short}</a>`;
}
