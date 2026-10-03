import type { MenuState } from "../../../src/commands/menu-state.js";
import { menuViews } from "../../../src/commands/menu-views.js";
import { uiPreferences } from "../../../src/ui/app/ui-preferences.js";
import type { ViewDefinition } from "../../../src/ui/app/view-definition.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { FixtureController, type ScanHold } from "./controller.js";
import { PROVIDERS_FIXTURE } from "./providers.js";
import { SCAN_FIXTURE } from "./scan.js";

/** Everything the app is mounted with for one screenshot. */
export interface AppFixture {
  readonly state: MenuState;
  readonly controller: FixtureController;
  readonly views: readonly ViewDefinition[];
}

export interface AppFixtureOptions {
  /** Stop the scan midway, as the scan-progress screenshot shows it. */
  readonly holdScan?: ScanHold;
}

/**
 * The menu as `gup` builds it — the production views, the state the menu
 * command starts from — on the fixture machine: the scan replays
 * `SCAN_FIXTURE`, and the Providers view reads `PROVIDERS_FIXTURE` instead of
 * probing the real machine. A view added to the menu shows up in the
 * screenshots by itself; one whose port reaches the system trips the spawn
 * guard until a fixture port replaces it here.
 */
export function appFixture(options: AppFixtureOptions = {}): AppFixture {
  const { fast, filter } = uiPreferences().current().scan;
  const fixturePorts = (view: ViewDefinition): ViewDefinition =>
    view.id === "providers" ? providersView({ status: async () => PROVIDERS_FIXTURE }) : view;
  return {
    state: { scans: [], fast, filter: [...filter], detectedCount: 0, providers: [] },
    controller: new FixtureController({ scan: SCAN_FIXTURE, ...options }),
    views: menuViews().map(fixturePorts),
  };
}
