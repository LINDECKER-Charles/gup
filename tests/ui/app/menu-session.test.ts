import { afterEach, describe, expect, it, vi } from "vitest";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../../src/core/runner.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type {
  Takeover,
  TakeoverSurface,
  ViewContext,
  ViewDefinition,
} from "../../../src/ui/app/view-definition.js";
import type { Panel } from "../../../src/ui/panels/panel.js";
import { NO_SCAN_YET, PANEL_HINTS_TAIL } from "../../../src/ui/text/menu-labels.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { toAscii } from "../../../src/ui/theme/glyphs.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import { bootMenu, defaultViews } from "../../support/tui/menu-driver.js";

const pkg = (id: string, current: string, latest: string) => ({ id, current, latest });
const WINGET: ProviderScanResult = {
  providerId: "winget",
  available: true,
  packages: [pkg("Git.Git", "2.51.0", "2.52.0"), pkg("7zip.7zip", "25.00", "25.01")],
};
const INITIAL_TIMEOUT_S = getInstallTimeoutSeconds();
/** Long enough for the session's 100 ms clock to tick a few times. */
const SEVERAL_FRAMES_MS = 350;

afterEach(() => {
  setInstallTimeoutSeconds(INITIAL_TIMEOUT_S);
});

/** The menu after its launch scan found WINGET, on Paquets. */
async function scanned() {
  const menu = await bootMenu({ scans: [WINGET], size: { cols: 110, rows: 26 } });
  await menu.waitForText("Git.Git");
  return menu;
}

/** A plain panel a test view hands the session. */
function panelOf(overrides: Partial<Panel> = {}): Panel {
  return {
    title: "Essai",
    isCapturingText: false,
    hints: () => "essai",
    render: () => [[{ text: "contenu d'essai", tone: "plain" }]],
    press: vi.fn(),
    click: vi.fn(),
    scroll: vi.fn(),
    ...overrides,
  };
}

/** The key-hint bar: the frame's last line, without its leading blank. */
function hintBar(frame: string): string {
  return (frame.trimEnd().split("\n").at(-1) ?? "").trim();
}

/** A group-1 view (sidebar label "Journal") built from `create`. */
function testView(create: (context: ViewContext) => Panel): ViewDefinition {
  return { id: "journal", label: "Journal", order: 50, group: 1, create };
}

describe("MenuSession", () => {
  it("scans on start, then lands on the package table", async () => {
    const menu = await scanned();
    const text = await menu.frame();
    expect(text).toContain("┏━ Paquets");
    expect(text).toContain(
      "1 provider(s)  │  2 mise(s) à jour  │  mode normal · tous les providers",
    );
    await menu.press("q");
    await expect(menu.exit).resolves.toEqual({ kind: "quit" });
  });

  it("updates the checked packages once confirmed, outside the screen", async () => {
    const menu = await scanned();
    await menu.press("down", "down", "space", "enter");
    expect(await menu.frame()).toContain("1 paquet(s) vont être mis à jour");
    await menu.press("o");
    const ended = await menu.exit;
    expect(ended.kind).toBe("outside");
    expect(menu.controller.updateOutside).not.toHaveBeenCalled();
    if (ended.kind === "outside") await ended.run();
    const picked = vi.mocked(menu.controller.updateOutside).mock.calls[0]![0];
    expect(picked.map((p) => p.pkg.id)).toEqual(["7zip.7zip"]);
  });

  it("keeps the session open when the update is declined", async () => {
    const menu = await scanned();
    await menu.press("down", "enter", "n");
    const text = await menu.frame();
    expect(text).not.toContain("vont être mis à jour");
    expect(text).toContain("┏━ Paquets");
    expect(menu.controller.updateOutside).not.toHaveBeenCalled();
  });

  it("lists the views by group, then Quitter, with the Paquets count", async () => {
    const menu = await scanned();
    const rows = (await menu.frame())
      .split("\n")
      .slice(2, 9)
      .map((row) => row.slice(1, 24).trim().replace(/ +/g, " "));
    expect(rows).toEqual([
      "Scan",
      "▌ Paquets 2",
      "",
      "Providers",
      "Options",
      "",
      "Quitter",
    ]);
  });

  it("loads the providers view the first time it is shown, once", async () => {
    const status = vi.fn(async () => ({
      platform: "win32" as const,
      detected: [{ id: "winget", displayName: "Winget" }],
      missing: [{ id: "brew", displayName: "Homebrew" }],
      incompatible: [],
    }));
    const views = [
      ...defaultViews().filter((view) => view.id !== "providers"),
      providersView({ status }),
    ];
    const menu = await bootMenu({ scans: [WINGET], views });
    await menu.waitForText("Git.Git");
    await menu.press("tab", "down");
    const text = await menu.waitForText("Homebrew");
    expect(text).toContain("╭─ Providers");
    expect(text).toContain("┏━ Menu");
    await menu.press("up", "down");
    expect(status).toHaveBeenCalledOnce();
  });

  it("keeps a non-scan launch view in front while the launch scan runs", async () => {
    const menu = await bootMenu({ scans: [WINGET], initialView: "options" });
    await menu.waitForText("2 mise(s) à jour");
    const text = await menu.frame();
    expect(text).toContain("┏━ Options");
    expect(text).not.toContain("Scan terminé");
  });

  it("starts on the previous results without scanning when asked to", async () => {
    const menu = await bootMenu({
      scanOnStart: false,
      initialView: "packages",
      state: { scans: [WINGET], detectedCount: 1 },
    });
    expect(await menu.waitForText("Git.Git")).toContain("┏━ Paquets");
    expect(menu.controller.scan).not.toHaveBeenCalled();
  });

  it("says how to scan when it starts with neither a scan nor results", async () => {
    const menu = await bootMenu({ scanOnStart: false, initialView: "packages" });
    const text = await menu.waitForText(NO_SCAN_YET);
    expect(text).not.toContain("Tout est à jour");
    expect(menu.controller.scan).not.toHaveBeenCalled();
    await menu.press("r");
    expect(await menu.waitForText("Scan terminé")).toContain("┏━ Scan");
  });

  it("says when the scan itself breaks", async () => {
    const menu = await bootMenu({
      controller: { scan: vi.fn(() => Promise.reject(new Error("registre illisible"))) },
    });
    expect(await menu.waitForText("Scan interrompu")).toContain("registre illisible");
  });

  it("edits the install timeout in a dialog the opening Enter does not submit", async () => {
    const menu = await scanned();
    await menu.press("tab", "down", "down", "enter", "down", "enter");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await menu.frame()).toContain("Timeout par install");
    for (let i = 0; i < 6; i++) menu.screen.mockInput.pressBackspace();
    await menu.screen.mockInput.typeText("abc");
    await menu.press("enter");
    expect(await menu.frame()).toContain("un nombre de secondes >= 0");
    for (let i = 0; i < 3; i++) menu.screen.mockInput.pressBackspace();
    await menu.screen.mockInput.typeText("90");
    await menu.press("enter");
    expect(getInstallTimeoutSeconds()).toBe(90);
    expect(await menu.frame()).toContain("[90s]");
  });
});

describe("MenuSession views", () => {
  it("tells a view it came to the front, and only then", async () => {
    const onShow = vi.fn();
    const menu = await bootMenu({
      views: [scanView(), testView(() => panelOf({ onShow }))],
      scanOnStart: false,
    });
    await menu.press("tab", "down", "down", "down");
    expect(onShow).toHaveBeenCalledOnce();
    expect(await menu.frame()).toContain("contenu d'essai");
  });

  it("offers neither tab nor q on the hint bar while the panel takes them as text", async () => {
    let isTyping = false;
    const panel: Panel = {
      ...panelOf({ hints: () => (isTyping ? "tapez pour filtrer" : "essai") }),
      get isCapturingText() {
        return isTyping;
      },
    };
    const menu = await bootMenu({ views: [testView(() => panel)], scanOnStart: false });
    expect(hintBar(await menu.frame())).toBe(`essai · ${PANEL_HINTS_TAIL}`);
    isTyping = true;
    await menu.press("x");
    expect(hintBar(await menu.frame())).toBe("tapez pour filtrer");
  });

  it("lets the focused panel claim a key before the global bindings, never q", async () => {
    const press = vi.fn();
    const panel = panelOf({ press, wantsKey: (key) => key.name === "left" || key.name === "q" });
    const menu = await bootMenu({ views: [testView(() => panel)], scanOnStart: false });
    await menu.press("left");
    expect(press).toHaveBeenCalledWith(expect.objectContaining({ name: "left" }));
    expect(await menu.frame()).toContain("┏━ Essai");
    await menu.press("q");
    await expect(menu.exit).resolves.toEqual({ kind: "quit" });
  });

  it("hands the whole body to a takeover until it is released", async () => {
    const takeover: Takeover = { press: vi.fn(), tick: vi.fn(), draw: vi.fn() };
    const start = vi.fn((surface: TakeoverSurface) => {
      surface.setHints("vue plein écran");
      return takeover;
    });
    let release = (): void => {};
    const view = testView((context) =>
      panelOf({
        press: (key) => {
          if (key.name === "x") release = context.takeOver(start);
        },
      }),
    );
    const menu = await bootMenu({ views: [view], scanOnStart: false });

    await menu.press("x");
    const during = await menu.frame();
    expect(during).not.toContain("Menu");
    expect(during).toContain("vue plein écran");
    await menu.press("q");
    expect(takeover.press).toHaveBeenCalledWith(expect.objectContaining({ name: "q" }));
    await vi.waitFor(() => expect(takeover.tick).toHaveBeenCalled());

    release();
    release();
    expect(await menu.frame()).toContain("┏━ Essai");
    await menu.press("q");
    await expect(menu.exit).resolves.toEqual({ kind: "quit" });
  });

  it("stops drawing once Ctrl+C took the screen away", async () => {
    const takeover: Takeover = { press: vi.fn(), tick: vi.fn(), draw: vi.fn() };
    const view = testView((context) => {
      context.takeOver(() => takeover);
      return panelOf();
    });
    const menu = await bootMenu({ views: [view], scanOnStart: false });
    await vi.waitFor(() => expect(takeover.tick).toHaveBeenCalled());

    await menu.press("ctrl+c");
    await expect(menu.exit).rejects.toBeInstanceOf(PromptCancelledError);
    const frames = vi.mocked(takeover.draw).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, SEVERAL_FRAMES_MS));
    expect(takeover.draw).toHaveBeenCalledTimes(frames);
  });

  it("adds each view's facts and badge to the title bar and the sidebar", async () => {
    const view: ViewDefinition = {
      ...testView(() => panelOf()),
      facts: () => ["3 planifiées"],
      badge: () => ({ text: "!", tone: "danger" }),
    };
    const menu = await bootMenu({ views: [scanView(), view], scanOnStart: false });
    const text = await menu.frame();
    expect(text).toContain("0 provider(s)  │  3 planifiées");
    expect(text).toMatch(/Journal +!/);
  });
});

describe("MenuSession preferences", () => {
  /** A scan that shows its spinner until the test ends. */
  const endlessScan = vi.fn(async (_state: unknown, events: { detecting(): void }) => {
    events.detecting();
    return new Promise<void>(() => {});
  });
  const SPINNER = /[◐◓◑◒] {2}détection/;

  async function spinnerFrames(animations: boolean): Promise<string[]> {
    const menu = await bootMenu({ controller: { scan: endlessScan }, preferences: { animations } });
    const first = (await menu.waitForText("détection")).match(SPINNER)?.[0] ?? "";
    await new Promise((resolve) => setTimeout(resolve, 350));
    const later = (await menu.frame()).match(SPINNER)?.[0] ?? "";
    return [first, later];
  }

  it("keeps the spinner still while animations are off", async () => {
    const [still, stillLater] = await spinnerFrames(false);
    expect(stillLater).toBe(still);
    const [turning, turned] = await spinnerFrames(true);
    expect(turned).not.toBe(turning);
  });

  it("redraws when a preference changes, without a key", async () => {
    const view = testView((context) =>
      panelOf({
        render: () => [
          [{ text: context.preferences().animations ? "animé" : "immobile", tone: "plain" }],
        ],
      }),
    );
    const menu = await bootMenu({ views: [view], scanOnStart: false });
    expect(await menu.frame()).toContain("animé");
    menu.setPreferences({ animations: false });
    expect(await menu.frame()).toContain("immobile");
  });

  it("redraws when the appearance changes, without a key", async () => {
    let isAscii = false;
    const listeners = new Set<() => void>();
    const createAppearance: AppearanceFactory = (renderer, tui) => ({
      ...legacyAppearance(renderer, tui),
      glyphs: (text) => (isAscii ? toAscii(text) : text),
      onChange: (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    });
    const view = testView(() => panelOf({ render: () => [[{ text: "✔ prêt", tone: "plain" }]] }));
    const menu = await bootMenu({ views: [view], scanOnStart: false, createAppearance });
    expect(await menu.frame()).toContain("✔ prêt");
    isAscii = true;
    for (const listener of listeners) listener();
    expect(await menu.frame()).toContain("+ prêt");
  });
});

describe("MenuSession package contributions", () => {
  const SCHEDULED: ProviderScanResult = {
    providerId: "winget",
    available: true,
    packages: [pkg("zlib", "1.0.0", "1.0.1"), pkg("Git.Git", "2.51.0", "3.0.0")],
  };

  /** Packages, plus a Journal view that adds `p` and marks Git.Git. */
  function withContributions(run: (selection: readonly unknown[]) => void) {
    const contributor: ViewDefinition = {
      ...testView(() => panelOf()),
      packageActions: () => [
        { key: "p", hint: "p planifier", emptyNotice: "rien de coché", run },
      ],
      packageMarkers: () => [
        { glyphFor: (_providerId, item) => (item.id === "Git.Git" ? "◷" : null) },
      ],
    };
    return [...defaultViews(), contributor];
  }

  it("shows other views' keys and marks in Paquets, keys acting on checked rows", async () => {
    const run = vi.fn();
    const menu = await bootMenu({
      scans: [SCHEDULED],
      views: withContributions(run),
      size: { cols: 160, rows: 30 },
    });
    const text = await menu.waitForText("Git.Git");
    expect(text).toContain("p planifier");
    expect(text).toMatch(/◷ Git\.Git/);
    await menu.press("down", "space", "p");
    expect(run).toHaveBeenCalledWith([{ providerId: "winget", pkg: SCHEDULED.packages[0] }]);
  });

  it("keeps the global keys on a hint bar too narrow for every view's keys", async () => {
    const menu = await bootMenu({
      scans: [SCHEDULED],
      views: withContributions(vi.fn()),
      size: { cols: 80, rows: 24 },
    });
    await menu.waitForText("Git.Git");
    await menu.press("down", "space");
    const hintBar = (await menu.frame()).trimEnd().split("\n").at(-1) ?? "";
    expect(hintBar).toMatch(/ · … · tab menu · q quitter$/);
  });

  it("re-sorts Paquets as soon as the preferred order changes", async () => {
    const menu = await bootMenu({ scans: [SCHEDULED] });
    const before = await menu.waitForText("Git.Git");
    expect(before.indexOf("zlib")).toBeLessThan(before.indexOf("Git.Git"));
    menu.setPreferences({ packageSort: "bump" });
    const after = await menu.frame();
    expect(after.indexOf("Git.Git")).toBeLessThan(after.indexOf("zlib"));
  });
});
