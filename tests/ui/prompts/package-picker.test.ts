import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The package picker of `gup update` without targets, on OpenTUI's in-memory
 * renderer. `promptPackageSelection` opens it on the real terminal's host:
 * the suites that go through it swap that host for the test one.
 */
const terminal = vi.hoisted(() => ({ host: null as ScreenHost | null }));
vi.mock("../../../src/ui/tui/screen-host.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../src/ui/tui/screen-host.js")>();
  const screenHost: ScreenHost = {
    run: (mount) => (terminal.host ?? real.screenHost).run(mount),
  };
  return { ...real, screenHost };
});

import { getProvider } from "../../../src/core/registry.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import {
  LAUNCH_NOTICES,
  PACKAGES_HINTS,
  PICKER_LABELS,
  SELECTION_BAR,
} from "../../../src/ui/text/packages-labels.js";
import { pickPackages } from "../../../src/ui/prompts/package-picker.js";
import { promptPackageSelection } from "../../../src/ui/select.js";
import type { ScreenHost } from "../../../src/ui/tui/screen-host.js";
import { pkg, scan } from "../../support/builders.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

afterEach(() => {
  terminal.host = null;
});

const SCANS: ProviderScanResult[] = [
  {
    providerId: "winget",
    available: true,
    packages: [
      { id: "Git.Git", current: "2.51.0", latest: "2.52.0" },
      { id: "7zip.7zip", current: "25.00", latest: "25.01" },
    ],
  },
];

async function openPicker() {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const { host, next } = createTestHost();
  const picked = pickPackages(SCANS, () => "Winget", host);
  return { picked, screen: await next() };
}

describe("pickPackages", () => {
  it("returns the packages checked in the table", async () => {
    const { picked, screen } = await openPicker();
    expect(await frame(screen)).toContain("╭─ Paquets");
    await press(screen, "space", "enter");
    expect((await picked).map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("picks nothing on Entrée with nothing checked, then a and Entrée take all", async () => {
    const { picked, screen } = await openPicker();
    await press(screen, "down", "enter");
    const text = await frame(screen);
    expect(text).toContain(LAUNCH_NOTICES.empty);
    expect(text).toContain("q annuler");
    await press(screen, "a", "enter");
    expect((await picked).map((p) => p.pkg.id)).toEqual(["Git.Git", "7zip.7zip"]);
  });

  it("keeps the selection bar on the last row when the terminal shrinks", async () => {
    const { picked, screen } = await openPicker();
    screen.resize(100, 12);
    const rows = (await frame(screen)).split("\n");
    // Bottom up: the key hints, the panel's border, then the bar.
    expect(rows.at(-3)).toContain(SELECTION_BAR.empty);
    await press(screen, "q");
    await picked;
  });

  it("returns nothing when left with q", async () => {
    const { picked, screen } = await openPicker();
    await press(screen, "q");
    await expect(picked).resolves.toEqual([]);
  });

  it("offers no q annuler while a filter is typed, q being a letter of it", async () => {
    const { picked, screen } = await openPicker();
    await press(screen, "/");
    const hints = (await frame(screen)).trimEnd().split("\n").at(-1) ?? "";
    expect(hints).toContain(PACKAGES_HINTS.filtering);
    expect(hints).not.toContain(PICKER_LABELS.cancelHint);
    await press(screen, "enter");
    expect((await frame(screen)).trimEnd().split("\n").at(-1)).toContain(PICKER_LABELS.cancelHint);
    await press(screen, "q");
    await expect(picked).resolves.toEqual([]);
  });
});

describe("promptPackageSelection", () => {
  it("groups the packages under each provider's display name, or its id when unregistered", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    terminal.host = host;
    const picked = promptPackageSelection([scan("winget", [pkg("Git.Git")]), scan("ghost", [pkg("x")])]);
    const screen = await next();
    const shown = await frame(screen);
    expect(shown).toContain(getProvider("winget")!.displayName);
    expect(shown).toContain("ghost");
    await press(screen, "q");
    await expect(picked).resolves.toEqual([]);
  });

  it("opens no screen when nothing is outdated", async () => {
    // The real terminal's host: under the test runner it refuses to open (no TTY).
    await expect(promptPackageSelection([scan("pip")])).resolves.toEqual([]);
  });
});
