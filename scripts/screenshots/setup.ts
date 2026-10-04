import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { setActiveLocale } from "../../src/core/i18n/locale.js";
import { FIXTURE_CLOCK } from "./fixtures/clock.js";
import { enterSandbox } from "./sandbox/env-sandbox.js";
import { freezeClock } from "./sandbox/frozen-clock.js";
import { spawnGuard } from "./sandbox/no-spawn.js";

// No scene may start a process or reach the OS: every export of these modules
// that can is replaced by a recorded refusal. The runner is gup's only spawn
// site for package managers; node-pty's loader probes a pseudo-terminal; the
// opener starts the browser; the trigger factory reaches Task Scheduler,
// launchd or cron. Scenes that need an embedded terminal or a scheduler get
// fixture ones instead (fixtures/update, fixtures/schedules).
vi.mock("../../src/core/runner.js", async (load) =>
  (await import("./sandbox/no-spawn.js")).guardedModule(load, "runner"),
);
vi.mock("../../src/core/pty/pty-loader.js", async (load) =>
  (await import("./sandbox/no-spawn.js")).guardedModule(load, "ptyLoader"),
);
vi.mock("../../src/core/export/open-external.js", async (load) =>
  (await import("./sandbox/no-spawn.js")).guardedModule(load, "opener"),
);
vi.mock("../../src/core/scheduler/trigger/trigger-factory.js", async (load) =>
  (await import("./sandbox/no-spawn.js")).guardedModule(load, "osTrigger"),
);

const CONFIG = "scripts/screenshots/vitest.config.ts";

// The time zone comes from the vitest config (`test.env`); a config edit that
// dropped it would shift every clock in the screenshots by the host's offset.
if (process.env["TZ"] !== FIXTURE_CLOCK.timeZone) {
  throw new Error(`screenshots need TZ=${FIXTURE_CLOCK.timeZone} (${CONFIG})`);
}

// The docs are written in English, so the screenshots show gup in English,
// whatever language the developer's own gup speaks. The generator runs none of
// gup's startup, which would choose the language: it is chosen here, before any
// scene module loads and reads a label.
setActiveLocale("en");

// Lists sorted by name follow ICU's default collation: under a POSIX one
// (a runner's `C.UTF-8`) npm would sort after Scoop, and every screenshot of
// Packages would differ from the committed one.
if ("npm".localeCompare("Scoop") > 0) {
  const { locale } = new Intl.Collator().resolvedOptions();
  throw new Error(`screenshots need a case-blind collation, not ${locale} (LC_ALL in ${CONFIG})`);
}

// Before any scene module loads: the runner reads GUP_INSTALL_TIMEOUT once, at import.
const leaveSandbox = enterSandbox();
afterAll(leaveSandbox);

// Never stub process.platform: OpenTUI resolves its native library from it.
// Views that depend on the OS take it from the fixtures instead.
let thaw: () => void = () => {};
beforeEach(() => {
  thaw = freezeClock(FIXTURE_CLOCK.now);
});

afterEach(() => {
  thaw();
  const attempts = spawnGuard.attempts;
  spawnGuard.reset();
  // Providers swallow probe errors: a refused spawn fails the scene here.
  expect(attempts, "the scene tried to start processes").toEqual([]);
});
