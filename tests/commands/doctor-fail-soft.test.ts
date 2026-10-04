import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../../src/commands/doctor.js";
import { ALL_PROVIDERS, getProvider } from "../../src/core/registry.js";
import { DOCTOR_PROVIDER_LABELS } from "../../src/ui/text/providers-labels.js";

/**
 * `gup doctor` over the real detection (testing finding F6): it used to
 * probe every provider with a bare Promise.all, so one probe that threw
 * crashed it and one that never answered hung it. Every registered probe is
 * stubbed here — the boundary — and everything above it runs for real.
 */

const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");
/** Longer than any probe's cap. */
const WEDGED_PROBE_MS = 60_000;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("gup doctor and a broken probe", () => {
  it("lists a probe that throws and a probe that never answers as missing, and exits 0", async () => {
    vi.useFakeTimers();
    let printed = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed += String(chunk).replace(ANSI, "");
      return true;
    });
    for (const provider of ALL_PROVIDERS) vi.spyOn(provider, "isAvailable").mockResolvedValue(false);
    vi.spyOn(getProvider("npm-g")!, "isAvailable").mockRejectedValue(new Error("EPERM"));
    vi.spyOn(getProvider("pip")!, "isAvailable").mockReturnValue(new Promise(() => {}));

    const done = doctorCommand();
    await vi.advanceTimersByTimeAsync(WEDGED_PROBE_MS);

    await expect(done).resolves.toBe(0);
    const missing = printed.slice(printed.indexOf(DOCTOR_PROVIDER_LABELS.missing));
    expect(missing).toContain(`(npm-g)`);
    expect(missing).toContain(`(pip)`);
  });
});
