import Table from "cli-table3";
import chalk from "chalk";
import { localized } from "../core/i18n/localized.js";
import { supportLabel } from "../core/platform/platform-label.js";
import type { ProviderStatusReport, ProviderSummary } from "../core/platform/types.js";
import { ALL_PROVIDERS } from "../core/registry.js";
import type { ProviderScanResult } from "../core/types.js";
import { counted } from "./text/format.js";
import { DOCTOR_PROVIDER_LABELS } from "./text/providers-labels.js";
import { STATUS_GLYPHS } from "./theme/glyphs.js";

/**
 * The scan table's own words. Its column headings and its scan error read
 * the same in every language, as they always have.
 */
const SCAN_TABLE_LABELS = localized({
  en: {
    upToDate: "up to date — no update available",
    available: (count: number) => counted(count, "update available", "updates available"),
  },
  fr: {
    upToDate: "à jour — aucune mise à jour disponible",
    available: (count) => `${count} mise(s) à jour disponible(s)`,
  },
});

function providerName(id: string): string {
  return ALL_PROVIDERS.find((p) => p.id === id)?.displayName ?? id;
}

function newScanTable(): Table.Table {
  return new Table({
    head: [
      chalk.bold("Provider"),
      chalk.bold("Package"),
      chalk.bold("Current"),
      chalk.bold("Latest"),
      chalk.bold("Note"),
    ],
    style: { head: [], border: ["gray"] },
    wordWrap: true,
  });
}

/** A provider's rows: either its scan error, or one line per package. */
function scanRows(result: ProviderScanResult): string[][] {
  const name = chalk.cyan(providerName(result.providerId));
  if (result.error) {
    return [[name, chalk.red(`scan error: ${result.error}`), "", "", ""]];
  }
  return result.packages.map((pkg) => [
    name,
    pkg.name ?? pkg.id,
    chalk.yellow(pkg.current),
    chalk.green(pkg.latest),
    pkg.note ? chalk.gray(pkg.note) : "",
  ]);
}

export function renderScanTable(results: ProviderScanResult[]): string {
  const table = newScanTable();
  const sorted = [...results].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );

  let total = 0;
  for (const result of sorted) {
    for (const row of scanRows(result)) table.push(row);
    if (!result.error) total += result.packages.length;
  }

  // A provider that could not scan is not up to date: its error row shows.
  const hasErrors = sorted.some((result) => result.error);
  if (total === 0 && !hasErrors) {
    return chalk.green(`  ${SCAN_TABLE_LABELS.upToDate}`);
  }
  const footer = chalk.bold(SCAN_TABLE_LABELS.available(total));
  return `${table.toString()}\n  ${footer}`;
}

const NAME_COLUMN = 24;
/** `(nuclei-templates)`, the longest registered id, fits with room to spare. */
const ID_COLUMN = 20;
const RULE_WIDTH = 40;
const HINT_INDENT = "      ";

/**
 * `gup doctor`'s provider listing: detected, missing (with how to install
 * them), then the providers foreign to this OS, dimmed. The glyph, the section
 * title and the "X only" badge carry the meaning without colour
 * (`NO_COLOR`, a piped stdout). Empty sections are left out, except the
 * detected one.
 */
export function renderProvidersStatus(report: ProviderStatusReport): string {
  const sections = [section(DOCTOR_PROVIDER_LABELS.detected, report.detected.map(detectedRow))];
  if (report.missing.length > 0) {
    sections.push(section(DOCTOR_PROVIDER_LABELS.missing, report.missing.map(missingRow)));
  }
  if (report.incompatible.length > 0) {
    const title = DOCTOR_PROVIDER_LABELS.incompatible(report.platform);
    sections.push(section(title, incompatibleRows(report.incompatible)));
  }
  return sections.join("\n\n");
}

function section(title: string, rows: readonly string[]): string {
  const rule = chalk.dim(`  ${"─".repeat(RULE_WIDTH)}`);
  return [chalk.bold(`  ${title}`), rule, ...rows].join("\n");
}

function detectedRow({ id, displayName }: ProviderSummary): string {
  const glyph = chalk.green(STATUS_GLYPHS.enabled);
  return `  ${glyph} ${displayName.padEnd(NAME_COLUMN)} ${chalk.dim(`(${id})`)}`;
}

function missingRow({ id, displayName, installHint }: ProviderSummary): string {
  const glyph = chalk.gray(STATUS_GLYPHS.disabled);
  const row = `  ${glyph} ${displayName.padEnd(NAME_COLUMN)} ${chalk.dim(`(${id})`)}`;
  return installHint ? `${row}\n${chalk.dim(`${HINT_INDENT}→ ${installHint}`)}` : row;
}

/**
 * Whole rows dimmed, and no install hint: the badge is the information. The
 * name column stretches to the longest name so the badges stay aligned
 * ("xcodes (Xcode version manager)" is wider than the usual column).
 */
function incompatibleRows(providers: readonly ProviderSummary[]): string[] {
  const nameWidth = Math.max(NAME_COLUMN, ...providers.map((p) => p.displayName.length));
  return providers.map(({ id, displayName, platforms }) => {
    const columns = `${displayName.padEnd(nameWidth)} ${`(${id})`.padEnd(ID_COLUMN)}`;
    const badge = supportLabel(platforms ?? []);
    return chalk.dim(`  ${STATUS_GLYPHS.incompatible} ${columns} ${badge}`);
  });
}
