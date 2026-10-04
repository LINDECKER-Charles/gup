import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The contrast audit of the run view, the in-menu update: the confirmation,
 * a package installing (its output in the embedded terminal), typing mode,
 * the stop dialog, the UAC step and its refusal notice, the results with a
 * failure and the HTML report's notice — under every audited theme. The
 * installer's own output keeps the terminal's colours: it is left out of
 * the measure and must sit on the terminal's background, never a
 * theme-painted one (IT-6).
 *
 * As in tests/ui/run/run-view.test.ts: node-pty is an in-memory fake, the
 * kill lever ends the fake child, the provider lookup answers an installer
 * provider, and the elevated batch never opens a UAC prompt.
 */
const hoisted = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  terminate: vi.fn((_pid: number): void => {}),
  runElevatedBatch: vi.fn(),
}));
vi.mock("../../../src/core/platform/lookup-provider.js", () => ({
  lookupProvider: (id: string) => {
    const provider = hoisted.providers.get(id);
    return provider
      ? { isFound: true, provider }
      : { isFound: false, error: `Provider inconnu: ${id}` };
  },
}));
vi.mock("../../../src/core/pty/pty-kill.js", () => ({
  ptyKill: { terminate: hoisted.terminate },
}));
vi.mock("../../../src/core/pty/exit-file.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createExitFileSlot: () => {
    throw new Error("no exit file in the UI suites");
  },
}));
vi.mock("../../../src/core/elevation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runElevatedBatch: hoisted.runElevatedBatch,
}));

import { inScreenLauncher } from "../../../src/ui/app/in-screen-launcher.js";
import type { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { EXPORT_LABELS } from "../../../src/ui/text/journal/journal-labels.js";
import { RUN_HINTS, RUN_NOTICES } from "../../../src/ui/text/run-key-labels.js";
import {
  ELEVATE_DIALOG,
  PANE_LABELS,
  RUN_TITLES,
  STOP_DIALOG,
} from "../../../src/ui/text/run-labels.js";
import { journalView } from "../../../src/ui/views/journal-view.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { installerProvider } from "../../support/pty/fake-installer.js";
import { fakePty, type FakePty } from "../../support/pty/fake-pty.js";
import {
  AUDIT_TIMEOUT_MS,
  AUDITED_ROWS,
  auditMenu,
  LEGACY_ON_WHITE,
  type Audit,
  type Audited,
} from "../../support/tui/contrast-audit.js";
import type { MenuDriver } from "../../support/tui/menu-driver.js";
import { journalData, scriptedSource } from "../panels/journal/journal-data.js";

const TRAMPOLINE = { script: "pty-exec.js", execArgv: [] };
/** What the fake installers print: the installer's text, in the terminal's own colours. */
const INSTALLER_OUTPUT = "Téléchargement du paquet en cours";
const REPORT_PATH = "C:\\r\\rapport.html";
/** The pipeline moves on its own (awaits, polling): wait in wall time, not in frames. */
const SETTLE_MS = 10_000;
const POLL_MS = 10;

let current: FakePty | null = null;

afterEach(() => {
  // End whatever install the walk left running, so nothing stays armed.
  for (const call of current?.spawned ?? []) call.handle.emitExit({ exitCode: 1 });
  hoisted.providers.clear();
});

async function shown(menu: MenuDriver, text: string): Promise<void> {
  await vi.waitFor(async () => expect(await menu.frame()).toContain(text), {
    timeout: SETTLE_MS,
    interval: POLL_MS,
  });
}

async function installsStarted(pty: FakePty, count: number): Promise<void> {
  await vi.waitFor(() => expect(pty.spawned).toHaveLength(count), {
    timeout: SETTLE_MS,
    interval: POLL_MS,
  });
}

/** Wait for `text`, then keep the frame under `state`. */
async function captured(audit: Audit, state: string, text: string): Promise<void> {
  await shown(audit.menu, text);
  await audit.capture(state, text);
}

function viewsOf(settings: SettingsService) {
  const journal = scriptedSource(journalData(), { ok: true, path: REPORT_PATH, opened: true });
  return [journalView(journal), optionsView({ settings: () => settings }), packagesView()];
}

/** The UAC step waits until the test releases it. */
function holdTheElevatedBatch(): () => void {
  let release = (): void => {};
  hoisted.runElevatedBatch.mockImplementation(
    (targets: string[]) =>
      new Promise((resolve) => {
        release = () => resolve(targets.map((target) => outcome(target.split(":")[1]!)));
      }),
  );
  return () => release();
}

/** alpha installs (typing, stop dialog), beta fails, then the UAC step for nodejs. */
async function walkTheRun(audit: Audit, pty: FakePty): Promise<void> {
  const { menu } = audit;
  await captured(audit, "confirmation of an in-menu update", "être mis à jour :");
  await menu.press("o");
  await installsStarted(pty, 1);
  pty.last().emitData(`${INSTALLER_OUTPUT}\r\n`);
  await captured(audit, "run view, a package installing", INSTALLER_OUTPUT);
  await menu.press("t");
  await captured(audit, "run view, typing into the installer", RUN_HINTS.typing);
  menu.screen.mockInput.pressKey("g", { ctrl: true });
  await menu.screen.flush();
  await menu.press("x");
  await captured(audit, "stop dialog", STOP_DIALOG.title);
  await menu.press("n");
  pty.last().emitExit({ exitCode: 0 });
  await installsStarted(pty, 2);
  pty.last().emitData(`${INSTALLER_OUTPUT}\r\n`);
  pty.last().emitExit({ exitCode: 3 });
}

async function walkTheElevationAndResults(audit: Audit, release: () => void): Promise<void> {
  const { menu } = audit;
  await captured(audit, "elevation question", ELEVATE_DIALOG.title);
  await menu.press("o");
  await captured(audit, "waiting for the UAC window", PANE_LABELS.admin.uac);
  await menu.press("s");
  await captured(audit, "skip refused during the UAC step", RUN_NOTICES.skipAdmin.uac);
  release();
  await captured(audit, "results with a failure", RUN_TITLES.done);
  await menu.press("o");
  await captured(audit, "results, the report's notice", EXPORT_LABELS.opened(REPORT_PATH));
}

async function violationsOf(audited: Audited, isLegacy = false): Promise<string[]> {
  const pty = fakePty();
  current = pty;
  hoisted.terminate.mockImplementation(() => pty.last().emitExit({ exitCode: 1 }));
  const release = holdTheElevatedBatch();
  hoisted.providers.set("essai", installerProvider({ id: "essai", displayName: "Essai" }));
  const audit = await auditMenu(audited, {
    scans: [scan("essai", [pkg("alpha"), pkg("beta"), pkg("nodejs", { requiresAdmin: true })])],
    size: { cols: 110, rows: 30 },
    launcher: inScreenLauncher({
      loadSupport: async () => ({ isAvailable: true, pty: pty.module, trampoline: TRAMPOLINE }),
      platform: "win32",
    }),
    views: viewsOf,
    paneTexts: [INSTALLER_OUTPUT, PANE_LABELS.approveUac, PANE_LABELS.adminElsewhere(1)],
    ...(isLegacy && { appearance: legacyAppearance }),
  });
  await shown(audit.menu, "alpha");
  await audit.menu.press("a", "enter");
  await walkTheRun(audit, pty);
  await walkTheElevationAndResults(audit, release);
  return audit.violations();
}

/**
 * Known failure, found by this audit: the embedded terminal paints the text
 * an installer leaves in the default colour — and gup's own notes in the
 * pane — explicit white, not in the terminal's foreground (OpenTUI 0.5.14's
 * EmbeddedTerminalRenderable offers no default-foreground option). On a
 * light terminal, Terminal.app's Basic profile (macOS's default) among them,
 * it is white on white. The other checks of these rows still hold; the pane
 * check runs as `it.fails`, so it turns red the day the pane draws in the
 * terminal's foreground and this list must shrink.
 */
const UNREADABLE_PANE_ON = new Set([
  "auto on a light terminal",
  "terminal on Terminal.app Basic",
  "terminal on Terminal.app Basic, 256 colours",
  "monochrome on Terminal.app Basic",
]);
const isPaneUnreadable = (violation: string) => violation.endsWith("in the terminal pane");

describe("contrast audit of the run view", () => {
  it.each(AUDITED_ROWS)(
    "%s: every text ≥ 4.5:1 (AAA 7:1), every border ≥ 3:1, the pane on the terminal's ground",
    async (label, audited) => {
      const violations = await violationsOf(audited);
      const known = UNREADABLE_PANE_ON.has(label) ? violations.filter(isPaneUnreadable) : [];
      expect(violations.filter((violation) => !known.includes(violation))).toEqual([]);
    },
    AUDIT_TIMEOUT_MS,
  );

  it.fails.each(AUDITED_ROWS.filter(([label]) => UNREADABLE_PANE_ON.has(label)))(
    "%s: the installer's output readable in the pane (known failure)",
    async (_label, audited) => {
      expect((await violationsOf(audited)).filter(isPaneUnreadable)).toEqual([]);
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
