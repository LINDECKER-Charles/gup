import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { FIXTURE_CLOCK } from "./fixtures/clock.js";
import { enterSandbox } from "./sandbox/env-sandbox.js";
import { freezeClock } from "./sandbox/frozen-clock.js";
import { spawnGuard } from "./sandbox/no-spawn.js";

// No scene may start a process: the runner is gup's only spawn site, and every
// export of it that can start one is replaced by a recorded refusal.
vi.mock("../../src/core/runner.js", async (importOriginal) => {
  const { spawnGuard: guard } = await import("./sandbox/no-spawn.js");
  return guard.guard(await importOriginal<typeof import("../../src/core/runner.js")>());
});

// The time zone comes from the vitest config (`test.env`); a config edit that
// dropped it would shift every clock in the screenshots by the host's offset.
if (process.env["TZ"] !== FIXTURE_CLOCK.timeZone) {
  const config = "scripts/screenshots/vitest.config.ts";
  throw new Error(`screenshots need TZ=${FIXTURE_CLOCK.timeZone} (${config})`);
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
