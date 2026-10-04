import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { ScanEvents } from "../../../src/ui/panels/scan-panel.js";
import { journalOptions } from "../../../src/ui/settings/journal-options.js";
import type { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { JOURNAL_OPTION_LABELS } from "../../../src/ui/text/settings/journal-options-labels.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import type * as wcag from "../../support/contrast/wcag.js";
import {
  AUDIT_TIMEOUT_MS,
  AUDITED_ROWS,
  auditMenu,
  escape,
  LEGACY_ON_WHITE,
  type Audit,
  type Audited,
} from "../../support/tui/contrast-audit.js";

/**
 * The contrast audit of the menu's work views: Paquets (rows, checks, the
 * filter, the update confirmation), Scan with a failure, Providers, and
 * Options — every sub-view, every dialog, the JOURNAL rows, and a custom
 * colour the user made unreadable on purpose. The other views have their own
 * audit suites (contrast-audit-views, contrast-audit-run).
 */

const pkg = (id: string, current: string, latest: string) => ({ id, current, latest });
const SCANS: ProviderScanResult[] = [
  {
    providerId: "winget",
    available: true,
    packages: [pkg("Git.Git", "2.51.0", "2.52.0"), pkg("7zip.7zip", "25.00", "25.01")],
  },
  { providerId: "scoop", available: true, packages: [pkg("ripgrep", "14.0.0", "15.1.0")] },
];

/** A scan that finds SCANS and reports one broken provider (the danger tone). */
async function scanWithFailure(state: MenuState, events: ScanEvents): Promise<void> {
  events.detecting();
  events.planned(SCANS.length + 1);
  for (const scan of SCANS) {
    events.finished(scan.providerId, { updates: scan.packages.length, ms: 900 });
  }
  events.finished("pip", { updates: 0, ms: 15_000, error: "délai dépassé" });
  events.completed(15_000);
  state.scans = [...SCANS];
  state.detectedCount = SCANS.length + 1;
}

/**
 * The work views, Options editing `settings` with the JOURNAL rows — the
 * debug log level overridden by the environment, so its row says so in the
 * warning tone.
 */
function viewsOf(settings: SettingsService) {
  const status = async () => ({
    platform: "win32" as const,
    detected: [],
    missing: [],
    incompatible: [],
  });
  const logLevel = () => ({ threshold: "debug" as const, source: "env" as const });
  return [
    optionsView({ settings: () => settings, extraSections: [journalOptions({ logLevel })] }),
    packagesView(),
    providersView({ status }),
    scanView(),
  ];
}

/** An input dialog takes the focus on the next turn. */
const FOCUS_SETTLE_MS = 10;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Paquets, the filter, the update confirmation, Scan with a failure,
 * Providers. No Escape here: the parser would merge it with the next key.
 */
async function walkTheViews({ menu, capture }: Audit): Promise<void> {
  await capture("Paquets, cursor row", "Git.Git");
  await menu.press("space", "down");
  await capture("Paquets, checked packages", "■");
  await menu.press("/", "g", "i", "t");
  await capture("Paquets, filter typed", "/ git");
  await menu.press("enter", "enter");
  await capture("update confirmation", "être mis à jour :");
  await menu.press("n", "tab", "up");
  await capture("Scan results with a failure", "délai dépassé");
  await menu.press("down", "down");
  await capture("Providers", "╭─ Providers");
}

/**
 * Options: the list, the timeout dialog, the theme picker and a preview, the
 * JOURNAL rows, the reset dialogs.
 */
async function walkTheOptions({ menu, capture }: Audit): Promise<void> {
  await menu.press("down", "enter", "down", "enter");
  await pause(FOCUS_SETTLE_MS);
  await capture("Options, timeout dialog", "Timeout par install");
  await escape(menu);
  await capture("Options, list", "APPARENCE");
  await menu.press("down", "down", "enter");
  await capture("Options, theme picker", "Aperçu");
  await menu.press("up");
  await capture("Options, theme picker on the previous theme", "Aperçu");
  await escape(menu);
  await menu.press("END", "up", "up", "up", "up");
  await capture("Options, JOURNAL rows, the level overridden", JOURNAL_OPTION_LABELS.logLevel);
  await menu.press("END", "up", "enter");
  await capture("Options, reset choice", "Scan & installation");
  await menu.press("enter");
  await capture("Options, reset confirmation", "aux valeurs par défaut");
  await menu.press("n");
}

const hexOf = (color: wcag.Rgb): string =>
  `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/**
 * The colour editor, its hex dialog, and an accent typed unreadable on
 * purpose — the background's own colour: it must be painted moved, readable.
 */
async function walkTheColours(audit: Audit): Promise<void> {
  const { menu, capture } = audit;
  await menu.press("HOME", "down", "down", "down", "down", "enter");
  await capture("colour editor", "Thème de base");
  await menu.press("enter");
  await pause(FOCUS_SETTLE_MS);
  await capture("colour editor, hex dialog", "Format #RRGGBB");
  for (let i = 0; i < "#RRGGBB".length; i++) menu.screen.mockInput.pressBackspace();
  await menu.screen.mockInput.typeText(hexOf(audit.ground()));
  await menu.press("enter");
  await capture("colour editor, an unreadable accent adjusted", "ajustée(s) automatiquement");
  await escape(menu);
}

async function violationsOf(audited: Audited, isLegacy = false): Promise<string[]> {
  const audit = await auditMenu(audited, {
    scans: SCANS,
    size: { cols: 110, rows: 30 },
    controller: { scan: vi.fn(scanWithFailure) },
    views: viewsOf,
    ...(isLegacy && { appearance: legacyAppearance }),
  });
  await walkTheViews(audit);
  await walkTheOptions(audit);
  if (audited.theme !== "monochrome" && !isLegacy) await walkTheColours(audit);
  return audit.violations();
}

describe("contrast audit of the menu's work views and Options", () => {
  it.each(AUDITED_ROWS)(
    "%s: every text ≥ 4.5:1 (AAA 7:1), every border ≥ 3:1",
    async (_label, audited) => {
      expect(await violationsOf(audited)).toEqual([]);
    },
    AUDIT_TIMEOUT_MS,
  );

  it(
    "catches what the theme does not paint: the legacy look on a light terminal",
    async () => {
      expect((await violationsOf(LEGACY_ON_WHITE, true)).length).toBeGreaterThan(0);
    },
    AUDIT_TIMEOUT_MS,
  );
});
