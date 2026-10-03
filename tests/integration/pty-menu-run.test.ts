import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * One update run end to end, the way a user drives it: the real menu (on
 * OpenTUI's in-memory renderer), the in-screen launcher, the run view and its
 * embedded terminals, the update pipeline, the runner, the PTY sink, node-pty
 * on a real pseudo-terminal (ConPTY on Windows) and the built trampoline. The
 * only stand-in is the provider: its "installs" are harmless node one-liners,
 * one of which asks a question the test answers by typing into the pane.
 */
const hoisted = vi.hoisted(() => ({ providers: new Map<string, unknown>() }));
vi.mock("../../src/core/platform/lookup-provider.js", () => ({
  lookupProvider: (id: string) => {
    const provider = hoisted.providers.get(id);
    return provider
      ? { isFound: true, provider }
      : { isFound: false, error: `Provider inconnu: ${id}` };
  },
}));

import { detectEmbeddedTerminal } from "../../src/core/pty/pty-loader.js";
import { skipCurrent } from "../../src/core/runner.js";
import { inScreenLauncher } from "../../src/ui/app/in-screen-launcher.js";
import { PANE_LABELS, RUN_TITLES } from "../../src/ui/text/run-labels.js";
import { pkg, scan } from "../support/builders.js";
import { installerProvider } from "../support/pty/fake-installer.js";
import { childProcessesOf, eventually } from "../support/pty/processes.js";
import { bundleTrampoline } from "../support/pty/trampoline-bundle.js";
import { bootMenu, type MenuDriver } from "../support/tui/menu-driver.js";

const RUN_TIMEOUT_MS = 90_000;
/** A real install through ConPTY takes from a quarter of a second to a few seconds when busy. */
const STEP_MS = 30_000;
const POLL_MS = 50;

/** What each package's "installer" does: print, ask, fail. ASCII only: it crosses a console. */
const INSTALLERS: Readonly<Record<string, string>> = {
  alpha: "console.log('gup-e2e: alpha ok')",
  beta:
    "process.stdout.write('Continuer ? ');" +
    "process.stdin.once('data', (d) => { console.log('reponse: ' + String(d).trim()); process.exit(0); });",
  gamma: "console.log('gup-e2e: gamma echoue'); process.exit(7)",
};

const bundle = await bundleTrampoline();
const support = await detectEmbeddedTerminal({ locate: () => bundle.location });

afterAll(async () => {
  await bundle.dispose();
});

afterEach(() => {
  // A failed assertion must not leave a real installer waiting on its prompt.
  for (let index = 0; index < Object.keys(INSTALLERS).length; index++) skipCurrent();
  hoisted.providers.clear();
});

async function shown(menu: MenuDriver, text: string): Promise<string> {
  return vi.waitFor(
    async () => {
      const frame = await menu.frame();
      expect(frame).toContain(text);
      return frame;
    },
    { timeout: STEP_MS, interval: POLL_MS },
  );
}

describe.skipIf(!support.isAvailable)("an update run inside the menu, on a real PTY", () => {
  it(
    "runs each package in its pane, takes a typed answer, and lands back on Paquets",
    async () => {
      const before = new Set((await childProcessesOf(process.pid)).map((child) => child.pid));
      hoisted.providers.set(
        "essai",
        installerProvider({
          id: "essai",
          displayName: "Essai",
          command: (packageId) => [process.execPath, ["-e", INSTALLERS[packageId] ?? ""]],
        }),
      );
      const menu = await bootMenu({
        scans: [scan("essai", [pkg("alpha"), pkg("beta"), pkg("gamma")])],
        launcher: inScreenLauncher({ loadSupport: async () => support }),
      });
      await shown(menu, "alpha");
      await menu.press("a", "enter");
      await shown(menu, "vont être mis à jour");
      await menu.press("o");

      await shown(menu, "Continuer ?");
      await menu.press("t", "o", "enter");

      const results = await shown(menu, RUN_TITLES.done);
      expect(results).toMatch(/✔ 2 mis à jour {3}↷ 0 ignoré\(s\) {3}✖ 1 échec\(s\)/);
      expect(results).toContain("gup-e2e: gamma echoue");
      expect(results).toContain(PANE_LABELS.output("essai · gamma"));
      await menu.press("up");
      expect(await shown(menu, "reponse: o")).toContain(PANE_LABELS.output("essai · beta"));

      await menu.press("enter");
      const back = await shown(menu, "┏━ Paquets");
      expect(back).toContain("gamma");
      expect(back).not.toContain("alpha");
      await eventually(async () => {
        const children = await childProcessesOf(process.pid);
        return children.every((child) => before.has(child.pid));
      }, STEP_MS);
    },
    RUN_TIMEOUT_MS,
  );
});
