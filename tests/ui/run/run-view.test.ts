import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The run view inside the real menu, on OpenTUI's in-memory renderer: the
 * real in-screen launcher, pipeline, runner and PTY sink, with three things
 * replaced — node-pty (an in-memory fake the test drives), the kill lever
 * (it ends the fake child instead of running taskkill), and the provider
 * lookup (a provider whose installs go through `runInherit`). The elevated
 * batch is replaced too: no UAC prompt from a unit test.
 */
const hoisted = vi.hoisted(() => ({
  providers: new Map<string, unknown>(),
  /** The test is over: every child still running, or started from now on, exits at once. */
  isDraining: false,
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
  ptyKill: { terminate: hoisted.terminate, force: vi.fn() },
}));
vi.mock("../../../src/core/pty/exit-file.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // The Windows fast path is covered by the PTY suites; here the fake child ends on its exit event.
  createExitFileSlot: () => {
    throw new Error("no exit file in the UI suites");
  },
}));
vi.mock("../../../src/core/elevation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runElevatedBatch: hoisted.runElevatedBatch,
}));

import type { OutdatedPackage } from "../../../src/core/types.js";
import { setBatchGuard } from "../../../src/core/update/update-extensions.js";
import { runInherit } from "../../../src/core/runner.js";
import { decodePayload } from "../../../src/core/pty/trampoline-payload.js";
import { inScreenLauncher } from "../../../src/ui/app/in-screen-launcher.js";
import type { UiPreferences } from "../../../src/ui/app/ui-preferences.js";
import { MANUAL_SKIP_MESSAGE } from "../../../src/core/update/finalize-outcome.js";
import {
  ELEVATE_DIALOG,
  PANE_LABELS,
  RETRY_DIALOG_TITLE,
  RUN_HINTS,
  RUN_NOTICES,
  RUN_NOTIFICATION,
  RUN_TITLES,
  STOP_DIALOG,
} from "../../../src/ui/text/run-labels.js";
import { PROMPT_IDLE_MS } from "../../../src/ui/run/prompt-hint.js";
import { NOTIFY_MIN_RUN_MS } from "../../../src/ui/run/run-view.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { outcome, pkg, scan } from "../../support/builders.js";
import { installerProvider } from "../../support/pty/fake-installer.js";
import { fakePty, type FakePty } from "../../support/pty/fake-pty.js";
import { bootMenu, type MenuDriver } from "../../support/tui/menu-driver.js";

const TRAMPOLINE = { script: "pty-exec.js", execArgv: [] };
const PACKAGES = [pkg("alpha"), pkg("beta"), pkg("gamma")];
/** Left of any dialog, low in the body: inside the terminal pane at 100 × 30. */
const PANE_POINT = { x: 4, y: 25 } as const;
/** Generous: other suites load the machine in parallel. */
const SETTLE_MS = 10_000;
const POLL_MS = 10;

interface RunMenuOptions {
  readonly packages?: readonly OutdatedPackage[];
  readonly platform?: NodeJS.Platform;
  readonly preferences?: Partial<UiPreferences>;
  readonly retryable?: readonly string[];
  readonly clock?: () => number;
  readonly createAppearance?: AppearanceFactory;
}

interface RunMenu {
  readonly menu: MenuDriver;
  readonly pty: FakePty;
}

let current: FakePty | null = null;

afterEach(() => {
  // End the run the test left behind, so no install stays armed (its timeout,
  // the runner's skip slot) into the next test.
  hoisted.isDraining = true;
  for (const call of current?.spawned ?? []) call.handle.emitExit({ exitCode: 1 });
  hoisted.providers.clear();
  setBatchGuard(null);
});

/** The menu with the in-screen launcher; every package checked, launched and confirmed. */
async function launched(options: RunMenuOptions = {}): Promise<RunMenu> {
  hoisted.isDraining = false;
  const pty = fakePty({
    onSpawn: (handle) => {
      if (hoisted.isDraining) queueMicrotask(() => handle.emitExit({ exitCode: 1 }));
    },
  });
  current = pty;
  hoisted.terminate.mockImplementation(() => pty.last().emitExit({ exitCode: 1 }));
  hoisted.runElevatedBatch.mockImplementation(async (targets: string[]) =>
    targets.map((target) => outcome(target.split(":")[1]!)),
  );
  hoisted.providers.set(
    "essai",
    installerProvider({ id: "essai", displayName: "Essai", retryable: options.retryable ?? [] }),
  );
  const menu = await bootMenu({
    scans: [scan("essai", [...(options.packages ?? PACKAGES)])],
    launcher: inScreenLauncher({
      loadSupport: async () => ({ isAvailable: true, pty: pty.module, trampoline: TRAMPOLINE }),
      platform: options.platform ?? "win32",
      ...(options.clock && { clock: options.clock }),
    }),
    ...(options.preferences && { preferences: options.preferences }),
    ...(options.createAppearance && { createAppearance: options.createAppearance }),
  });
  await shown(menu, (options.packages ?? PACKAGES)[0]!.id);
  await menu.press("a", "enter");
  await shown(menu, "vont être mis à jour");
  await menu.press("o");
  return { menu, pty };
}

/** Wait until `count` installs have started in the fake pseudo-terminal. */
async function installsStarted(pty: FakePty, count: number): Promise<void> {
  await vi.waitFor(() => expect(pty.spawned).toHaveLength(count), {
    timeout: SETTLE_MS,
    interval: POLL_MS,
  });
}

/** What the installers received from the keyboard, as text. */
function typed(pty: FakePty): string {
  return pty.spawned
    .flatMap((call) => call.handle.written)
    .map((data) => (typeof data === "string" ? data : data.toString("latin1")))
    .join("");
}

/**
 * The frame once it shows `text`. The pipeline moves on its own (awaits, the
 * batch guard's polling): wait in wall time, not in a fixed number of frames.
 */
async function shown(menu: MenuDriver, text: string): Promise<string> {
  return vi.waitFor(
    async () => {
      const frame = await menu.frame();
      expect(frame).toContain(text);
      return frame;
    },
    { timeout: SETTLE_MS, interval: POLL_MS },
  );
}

async function pressCtrlG(menu: MenuDriver): Promise<void> {
  menu.screen.mockInput.pressKey("g", { ctrl: true });
  await menu.screen.flush();
}

describe("run view", () => {
  it("updates inside the screen, one terminal per package, then back to Paquets pruned", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    expect(decodePayload(pty.spawned[0]!.args[1]!).args).toEqual(["alpha"]);
    pty.last().emitData("Téléchargement de alpha…\r\n");
    const running = await shown(menu, "Téléchargement de alpha");
    expect(running).toContain(RUN_TITLES.running);
    expect(running).toContain("essai · alpha");
    expect(running).toContain(RUN_HINTS.running(false));

    pty.last().emitExit({ exitCode: 0 });
    await installsStarted(pty, 2);
    pty.last().emitExit({ exitCode: 3 });
    await installsStarted(pty, 3);
    pty.last().emitExit({ exitCode: 0 });

    const results = await shown(menu, RUN_TITLES.done);
    expect(results).toMatch(/✔ 2 mis à jour {3}↷ 0 ignoré\(s\) {3}✖ 1 échec\(s\)/);
    expect(results).toMatch(/› ✖ beta /);
    expect(results).toContain(PANE_LABELS.output("essai · beta"));
    await menu.press("enter");
    const back = await shown(menu, "┏━ Paquets");
    expect(back).toContain("beta");
    expect(back).not.toContain("alpha");
    expect(back).not.toContain("gamma");
  });

  it("s skips the install in flight and goes on with the next package", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("s");
    expect(hoisted.terminate).toHaveBeenCalledOnce();
    await installsStarted(pty, 2);
    expect(await shown(menu, MANUAL_SKIP_MESSAGE)).toMatch(/↷ alpha /);
  });

  it("x asks first: Non keeps going, Oui interrupts the package and cancels the rest", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("x");
    expect(await menu.frame()).toContain("les 2 paquet(s) restant(s)");
    await menu.press("n");
    expect(hoisted.terminate).not.toHaveBeenCalled();

    await menu.press("x", "o");
    const results = await shown(menu, RUN_TITLES.done);
    expect(hoisted.terminate).toHaveBeenCalledOnce();
    expect(pty.spawned).toHaveLength(1);
    expect(results).toMatch(/⊘ 2 annulé\(s\)/);
  });

  it("Ctrl+C skips the install in flight without leaving gup", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("ctrl+c");
    await installsStarted(pty, 2);
    expect(await menu.frame()).toContain(RUN_NOTICES.ctrlCFirst);
    expect(hoisted.terminate).toHaveBeenCalledOnce();
  });

  it("Ctrl+C twice in a row stops the run", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("ctrl+c");
    await installsStarted(pty, 2);
    await menu.press("ctrl+c");
    const results = await shown(menu, RUN_TITLES.done);
    expect(pty.spawned).toHaveLength(2);
    expect(results).toMatch(/↷ 2 ignoré\(s\) {3}✖ 0 échec\(s\) {3}⊘ 1 annulé\(s\)/);
  });

  it("refuses q while the run goes on", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("q");
    expect(await menu.frame()).toContain(RUN_NOTICES.quit);
    pty.last().emitExit({ exitCode: 0 });
    await installsStarted(pty, 2);
  });

  it("t hands the keyboard to the installer; Ctrl+C reaches it, Ctrl+G takes it back", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("t");
    expect(await menu.frame()).toContain(RUN_HINTS.typing);
    expect(await menu.frame()).toContain(PANE_LABELS.focused);
    await menu.press("y", "enter", "q", "ctrl+c");
    expect(typed(pty)).toBe("y\rq\x03");
    expect(hoisted.terminate).not.toHaveBeenCalled();

    await pressCtrlG(menu);
    await menu.press("y");
    expect(typed(pty)).toBe("y\rq\x03");
    expect(await menu.frame()).toContain(RUN_HINTS.running(false));
  });

  it("while a dialog is open, a click on the pane then Entrée sends nothing to the installer", async () => {
    const { menu, pty } = await launched();
    await installsStarted(pty, 1);
    await menu.press("x");
    await menu.screen.mockMouse.click(PANE_POINT.x, PANE_POINT.y);
    await menu.press("enter");
    expect(typed(pty)).toBe("");
    expect(hoisted.terminate).not.toHaveBeenCalled();
    expect(await menu.frame()).not.toContain(STOP_DIALOG.title);
  });

  it("waits for the UAC window: s refused, x stops after the step", async () => {
    const { menu, pty } = await launched({
      packages: [pkg("alpha"), pkg("nodejs", { requiresAdmin: true })],
    });
    let finishBatch = (): void => {};
    hoisted.runElevatedBatch.mockImplementation(
      (targets: string[]) =>
        new Promise((resolve) => {
          finishBatch = () => resolve(targets.map((target) => outcome(target.split(":")[1]!)));
        }),
    );
    await installsStarted(pty, 1);
    pty.last().emitExit({ exitCode: 0 });
    expect(await shown(menu, ELEVATE_DIALOG.title)).toContain("Ouvrir une invite UAC");
    await menu.press("o");

    const waiting = await shown(menu, PANE_LABELS.admin.uac);
    expect(waiting).toContain(PANE_LABELS.approveUac);
    expect(waiting).toContain(RUN_HINTS.elevating.uac);
    expect(waiting).toMatch(/nodejs .* fenêtre admin…/);
    await menu.press("s");
    expect(await menu.frame()).toContain(RUN_NOTICES.skipAdmin.uac);
    await menu.press("x");
    expect(await menu.frame()).toContain(RUN_NOTICES.stopAfterStep);
    expect(hoisted.terminate).not.toHaveBeenCalled();

    finishBatch();
    expect(await shown(menu, RUN_TITLES.done)).toMatch(/✔ nodejs .* admin/);
  });

  it("runs the sudo step in the pane on macOS and Linux: one password, typed there", async () => {
    hoisted.runElevatedBatch.mockReset();
    const { menu, pty } = await launched({
      packages: [pkg("nodejs", { requiresAdmin: true })],
      platform: "linux",
    });
    hoisted.runElevatedBatch.mockImplementation(async (targets: string[]) => {
      await runInherit("sudo", ["node", "gup", "__admin-batch"]);
      return targets.map((target) => outcome(target.split(":")[1]!));
    });
    expect(await shown(menu, ELEVATE_DIALOG.title)).toContain("sudo demandera votre");
    await menu.press("o");
    await installsStarted(pty, 1);
    pty.last().emitData("[sudo] Mot de passe de charles : ");
    const prompt = await shown(menu, PANE_LABELS.admin.sudo);
    expect(prompt).toContain(RUN_HINTS.elevating.sudo);
    expect(prompt).not.toContain(PANE_LABELS.approveUac);

    await menu.press("t", "s", "e", "c", "enter");
    expect(typed(pty)).toBe("sec\r");
    pty.last().emitExit({ exitCode: 0 });
    expect(await shown(menu, RUN_TITLES.done)).toMatch(/✔ nodejs /);
  });

  it("offers a retry strategy for recoverable failures and replays them in the view", async () => {
    const { menu, pty } = await launched({ packages: [pkg("alpha")], retryable: ["alpha"] });
    await installsStarted(pty, 1);
    pty.last().emitExit({ exitCode: 3 });
    expect(await shown(menu, RETRY_DIALOG_TITLE)).toContain("Aucun — laisser les échecs");
    await menu.press("down", "enter");

    await installsStarted(pty, 2);
    expect(decodePayload(pty.spawned[1]!.args[1]!).args).toEqual(["alpha", "--force"]);
    expect(await shown(menu, "↻ retry --force")).toMatch(/◐|◓|◑|◒/);
    pty.last().emitExit({ exitCode: 0 });
    expect(await shown(menu, RUN_TITLES.done)).toMatch(/✔ alpha .*↻ retry --force/);
  });

  it("says when another gup run holds the update batch, and gives up on x", async () => {
    setBatchGuard({
      enter: (wait) => {
        wait.onWait({ kind: "scheduled", pid: 7, startedAt: new Date().toISOString() });
        const isAborted = () => expect(wait.isAborted()).toBe(true);
        return vi
          .waitFor(isAborted, { timeout: SETTLE_MS, interval: POLL_MS })
          .then(() => () => {});
      },
    });
    const { menu, pty } = await launched();
    expect(await shown(menu, "Une mise à jour planifiée est en cours")).toContain(
      RUN_HINTS.waiting,
    );
    await menu.press("x", "o");
    expect(await shown(menu, RUN_TITLES.done)).toMatch(/⊘ 3 annulé\(s\)/);
    expect(pty.spawned).toHaveLength(0);
  });

  it("hints that a silent installer may be waiting for an answer, without typing it", async () => {
    let now = 0;
    const { menu, pty } = await launched({ clock: () => now });
    await installsStarted(pty, 1);
    pty.last().emitData("Mot de passe : ");
    await shown(menu, "Mot de passe");
    expect(await menu.frame()).not.toContain(RUN_NOTICES.prompt);
    now = PROMPT_IDLE_MS;
    await shown(menu, RUN_NOTICES.prompt);
    expect(typed(pty)).toBe("");
  });

  it("notifies the terminal when a run of a minute or more ends, if asked to", async () => {
    let now = 0;
    const { menu, pty } = await launched({
      packages: [pkg("alpha")],
      preferences: { notifyOnDone: true },
      clock: () => now,
    });
    const notify = vi.spyOn(menu.screen.renderer, "triggerNotification").mockReturnValue(true);
    await installsStarted(pty, 1);
    now = NOTIFY_MIN_RUN_MS;
    pty.last().emitExit({ exitCode: 0 });
    await shown(menu, RUN_TITLES.done);
    expect(notify).toHaveBeenCalledWith(RUN_NOTIFICATION.body(1, 0, 0), RUN_NOTIFICATION.title);
  });

  it("stays quiet after a short run", async () => {
    const { menu, pty } = await launched({
      packages: [pkg("alpha")],
      preferences: { notifyOnDone: true },
    });
    const notify = vi.spyOn(menu.screen.renderer, "triggerNotification").mockReturnValue(true);
    await installsStarted(pty, 1);
    pty.last().emitExit({ exitCode: 0 });
    await shown(menu, RUN_TITLES.done);
    expect(notify).not.toHaveBeenCalled();
  });

  it("draws the installer's output on the terminal's own background under a themed screen", async () => {
    const themed: AppearanceFactory = (renderer, tui) => ({
      ...legacyAppearance(renderer, tui),
      background: () => tui.RGBA.fromInts(30, 30, 46),
    });
    const { menu, pty } = await launched({ createAppearance: themed });
    await installsStarted(pty, 1);
    pty.last().emitData("sortie de l'installeur\r\n");
    await shown(menu, "sortie de l'installeur");
    const lines = menu.screen.captureSpans().lines;
    const paneSpan = lines
      .flatMap((line) => line.spans)
      .find((span) => span.text.includes("sortie de l'installeur"));
    expect(paneSpan?.bg.intent).toBe("default");
    const titleSpan = lines.flatMap((line) => line.spans).find((s) => s.text.includes("alpha"));
    expect(titleSpan?.bg.intent).toBe("rgb");
  });

  it("closes its gate on the signals that end gup, only while the batch runs", async () => {
    const { menu, pty } = await launched({ packages: [pkg("alpha")] });
    await installsStarted(pty, 1);
    const whileRunning = process.listenerCount("SIGTERM");
    pty.last().emitExit({ exitCode: 0 });
    await shown(menu, RUN_TITLES.done);
    // The screen host keeps its own listener; the run's gate is gone with the batch.
    expect(process.listenerCount("SIGTERM")).toBe(whileRunning - 1);
  });
});
