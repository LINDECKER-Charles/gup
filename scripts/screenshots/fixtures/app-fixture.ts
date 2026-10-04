import { journalSource } from "../../../src/commands/journal/journal-source.js";
import { currentLogLevel } from "../../../src/commands/journal/log-session.js";
import type { MenuState } from "../../../src/commands/menu-state.js";
import { menuViews } from "../../../src/commands/menu-views.js";
import type { SchedulesController } from "../../../src/commands/schedule/schedules-controller.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import type { LauncherFactory } from "../../../src/ui/app/update-launcher.js";
import type { ViewDefinition } from "../../../src/ui/app/view-definition.js";
import { journalOptions } from "../../../src/ui/settings/journal-options.js";
import {
  SettingsService,
  type SettingsKey,
  type SettingsMap,
} from "../../../src/ui/settings/settings-service.js";
import { journalView } from "../../../src/ui/views/journal-view.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { schedulesView } from "../../../src/ui/views/schedules-view.js";
import { FIXTURE_CLOCK } from "./clock.js";
import { FixtureController, type ScanHold } from "./controller.js";
import { writeDebugLogFixture } from "./journal/debug-log.js";
import { writeHistoryFixture } from "./journal/history.js";
import { PROVIDERS_FIXTURE } from "./providers.js";
import { SCAN_FIXTURE } from "./scan.js";
import { fixtureSchedules } from "./schedules/fixture-schedules.js";
import { fixtureLauncher } from "./update/fixture-launcher.js";
import { ScriptedRun, type ScriptedInstall } from "./update/scripted-run.js";

/** Settings a scene starts from, over the defaults: a theme, a custom colour… */
export type SettingsPatch = { readonly [K in SettingsKey]?: Partial<SettingsMap[K]> };

/** Everything the app is mounted with for one screenshot. */
export interface AppFixture {
  readonly state: MenuState;
  readonly controller: FixtureController;
  readonly views: readonly ViewDefinition[];
  /** The menu's update launcher: the in-screen one, on a scripted run. */
  readonly launcher: LauncherFactory;
  /** The scene's own settings, in memory: the defaults, then the scene's patch. */
  readonly settings: SettingsService;
  /** Let whatever the scene held — a scan, an install — finish. */
  release(): void;
}

export interface AppFixtureOptions {
  /** Stop the scan midway, as the scan-progress screenshot shows it. */
  readonly holdScan?: ScanHold;
  /** How the packages the scene launches get updated. */
  readonly updates?: readonly ScriptedInstall[];
  readonly settings?: SettingsPatch;
}

interface FixturePorts {
  readonly schedules: SchedulesController;
  readonly settings: SettingsService;
}

/**
 * The menu as `gup` builds it — the production views, the state the menu
 * command starts from, the in-screen update launcher — on the fixture
 * machine: the scan replays `SCAN_FIXTURE`; Providers reads
 * `PROVIDERS_FIXTURE` instead of probing the machine; Schedules and the
 * Journal's schedule names read the fixture schedules over a fixture OS
 * trigger; the Journal reads the history and debug log the fixture writes in
 * the sandbox; Options and the Journal read the scene's own settings, never
 * a file. A view added to the menu shows up in the screenshots by itself;
 * one whose port reaches the system trips the spawn guard until a fixture
 * port replaces it here.
 */
export function appFixture(options: AppFixtureOptions = {}): AppFixture {
  writeHistoryFixture(FIXTURE_CLOCK.now);
  writeDebugLogFixture(FIXTURE_CLOCK.now);
  const ports: FixturePorts = {
    schedules: fixtureSchedules(FIXTURE_CLOCK.now),
    settings: sceneSettings(options.settings ?? {}),
  };
  // The menu command starts from the scan settings, as `gup` does.
  const { fast, providerFilter } = ports.settings.get("scan");
  const { holdScan } = options;
  const controller = new FixtureController({ scan: SCAN_FIXTURE, ...(holdScan && { holdScan }) });
  const run = new ScriptedRun(options.updates ?? [], FIXTURE_CLOCK.now);
  return {
    state: { scans: [], fast, filter: [...providerFilter], detectedCount: 0, providers: [] },
    controller,
    views: menuViews().map((view) => fixturePort(view, ports)),
    launcher: fixtureLauncher(run),
    settings: ports.settings,
    release: () => {
      controller.release();
      run.release();
    },
  };
}

/** `view`, or the same view on fixture data where its port would reach the machine. */
function fixturePort(view: ViewDefinition, { schedules, settings }: FixturePorts): ViewDefinition {
  switch (view.id) {
    case "providers":
      return providersView({ status: async () => PROVIDERS_FIXTURE });
    case "schedules":
      return schedulesView(schedules);
    case "journal":
      return journalView(journalSource, {
        settings: () => settings,
        scheduleName: (id) => schedules.scheduleName(id),
      });
    case "options":
      return optionsView({
        settings: () => settings,
        extraSections: [journalOptions({ logLevel: currentLogLevel })],
      });
    default:
      return view;
  }
}

/**
 * Settings in memory, as with `GUP_CONFIG=0`: the defaults, then `patch`.
 * Nothing is read from or written to a file, and no scene sees another's.
 */
function sceneSettings(patch: SettingsPatch): SettingsService {
  const settings = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
  for (const key of Object.keys(patch) as SettingsKey[]) applySection(settings, key, patch);
  return settings;
}

function applySection<K extends SettingsKey>(
  settings: SettingsService,
  key: K,
  patch: SettingsPatch,
): void {
  const section = patch[key];
  if (section !== undefined) settings.update(key, section);
}
