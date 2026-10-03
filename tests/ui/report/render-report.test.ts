import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { embedJson } from "../../../src/report/embed-json.js";
import { escapeHtml } from "../../../src/report/html-shell.js";
import { REPORT_LABELS } from "../../../src/report/report-labels.js";
import { renderReportHtml } from "../../../src/report/render-report.js";
import { updateEvent } from "../../support/history-fixtures.js";
import { realisticHistory, reportModelOf } from "./report-fixtures.js";

/**
 * The report is a file the user opens from disk: whatever the history holds,
 * it must not run anything but its own script, load anything, or let data
 * reach the markup.
 */

const HOSTILE = '</script><img src=x onerror=alert(1)><script>alert(2)</script>\u2028\u2029&amp;';

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("base64");

function inlineBlocks(html: string) {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  const json = (id: string) => scripts.find((match) => match[0].includes(`id="${id}"`))?.[1] ?? "";
  const code = scripts.filter((match) => !match[0].startsWith("<script type=")).map((match) => match[1] ?? "");
  return { style, code, data: json("gup-report-data"), labels: json("gup-report-labels") };
}

function policyOf(html: string): string {
  return /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? "";
}

describe("renderReportHtml", () => {
  const html = renderReportHtml(reportModelOf(realisticHistory()));

  it("allows only its own stylesheet and script, by hash, and nothing else to load", () => {
    const { style, code } = inlineBlocks(html);
    const policy = policyOf(html);

    expect(code).toHaveLength(1);
    expect(policy.split("; ")).toEqual([
      "default-src 'none'",
      `script-src 'sha256-${sha256(code[0] ?? "")}'`,
      `style-src 'sha256-${sha256(style)}'`,
      "img-src data:",
      "base-uri 'none'",
      "form-action 'none'",
      "require-trusted-types-for 'script'",
      "trusted-types 'none'",
    ]);
  });

  it("is French, offline and private", () => {
    expect(html).toMatch(/^<!doctype html>\n<html lang="fr">/);
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).not.toMatch(/<(?:link rel="stylesheet"|iframe|object|embed|base)\b/);
    expect(html).not.toMatch(/\s(?:src|srcset|action|formaction)=/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("references no address: the only URL is the namespace inside the inline icon", () => {
    const urls = [...html.matchAll(/https?:\/\/[^\s"')]+/g)].map((match) => match[0]);
    const icon = /<link rel="icon" href="data:image\/svg\+xml,[^"]+">/.exec(html)?.[0] ?? "";

    expect(urls).toEqual(["http://www.w3.org/2000/svg"]);
    expect(icon).toContain("xmlns='http://www.w3.org/2000/svg'");
  });

  it("embeds the data and the labels as JSON that reads back intact", () => {
    const { data, labels } = inlineBlocks(html);

    expect(JSON.parse(data)).toEqual(JSON.parse(JSON.stringify(reportModelOf(realisticHistory()))));
    expect(JSON.parse(labels)).toEqual(REPORT_LABELS);
  });

  it("keeps hostile history text inert: escaped in the data block, never in the markup", () => {
    const events = [updateEvent("pip", HOSTILE, { status: "failed", message: HOSTILE, ts: "2026-10-01T10:00:00Z" })];
    const report = reportModelOf(events);
    const page = renderReportHtml(report);
    const { data } = inlineBlocks(page);

    expect(data).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(data).packages[0].id).toBe(HOSTILE);
    expect(page.match(/<script/g)).toHaveLength(3);
    expect(page).not.toContain("<img");
    expect(page).not.toContain("alert(1)>");
  });

  it("escapes the period in the title, the only dynamic text of the markup", () => {
    const report = reportModelOf([]);
    const page = renderReportHtml({ ...report, meta: { ...report.meta, period: { ...report.meta.period, label: "<b>&" } } });

    expect(page).toContain("<title>gup — Rapport d&#39;activité (&lt;b&gt;&amp;)</title>");
  });
});

describe("embedJson", () => {
  it("writes the characters that could end a script block as escapes", () => {
    const text = embedJson({ value: "</script><!-- & \u2028 \u2029" });

    expect(text).toBe('{"value":"\\u003c/script\\u003e\\u003c!-- \\u0026 \\u2028 \\u2029"}');
    expect(JSON.parse(text)).toEqual({ value: "</script><!-- & \u2028 \u2029" });
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter in text and attributes", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});
