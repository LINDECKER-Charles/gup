import type { ReportModel } from "../core/export/report-types.js";
import { activeLocale } from "../core/i18n/locale.js";
import { REPORT_JS } from "./client/index.js";
import { contentSecurityPolicy, sha256Base64 } from "./csp.js";
import { embedJson } from "./embed-json.js";
import { escapeHtml, reportBody } from "./html-shell.js";
import { REPORT_IDS } from "./report-dom.js";
import { REPORT_LABELS } from "./report-labels.js";
import { REPORT_CSS } from "./styles/index.js";

/**
 * The HTML report: one self-contained file that opens offline from disk.
 * Its stylesheet and script are inline and allowed by their SHA-256 in the
 * page's Content-Security-Policy; nothing else may load or run. The labels
 * and the data travel as escaped JSON blocks the script reads; the only
 * dynamic text in the markup itself (the title, the version) is HTML-escaped.
 *
 * The report is written in the language active when it is rendered: the
 * page's `lang`, its markup and the labels it embeds, while the data carries
 * the matching Intl locale. The script is the same in every language, and so
 * is the policy that allows it.
 */

/** A check mark on the accent colour: the tab icon, inline (img-src data: only). */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' rx='8' fill='%230a5fc2'/%3E" +
  "%3Cpath d='M9 16.5l4.8 4.8L23 11.5' fill='none' stroke='%23fff' stroke-width='3.4' " +
  "stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

let policy: string | null = null;

/** The policy for the page's own script and stylesheet (computed once). */
function reportPolicy(): string {
  policy ??= contentSecurityPolicy({
    script: sha256Base64(REPORT_JS),
    style: sha256Base64(REPORT_CSS),
  });
  return policy;
}

export function renderReportHtml(model: ReportModel): string {
  const title = REPORT_LABELS.document.title.replace("{period}", model.meta.period.label);
  return [
    "<!doctype html>",
    `<html lang="${activeLocale()}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${reportPolicy()}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light dark">',
    `<meta name="generator" content="gup ${escapeHtml(model.meta.gup)}">`,
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="icon" href="${FAVICON}">`,
    `<style>${REPORT_CSS}</style>`,
    "</head>",
    "<body>",
    reportBody(),
    // Read now, key by key: the active language's catalog, as plain data.
    jsonBlock(REPORT_IDS.labels, { ...REPORT_LABELS }),
    jsonBlock(REPORT_IDS.data, model),
    `<script>${REPORT_JS}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function jsonBlock(id: string, value: unknown): string {
  return `<script type="application/json" id="${id}">${embedJson(value)}</script>`;
}
