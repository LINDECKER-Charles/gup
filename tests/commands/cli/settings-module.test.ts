import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliModule } from "../../../src/commands/cli/cli-module.js";
import { CLI_MODULES } from "../../../src/commands/cli/cli-modules.js";
import {
  createSettingsModule,
  settingsModule,
  type SettingsModuleDeps,
} from "../../../src/commands/cli/settings-module.js";
import { installStartup } from "../../../src/commands/cli/startup.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { ADMIN_BATCH_COMMAND } from "../../../src/core/elevation.js";
import { getInstallTimeoutSeconds, setInstallTimeoutSeconds } from "../../../src/core/runner.js";
import { setUiPreferencesSource, uiPreferences } from "../../../src/ui/app/ui-preferences.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { configureScreens } from "../../../src/ui/tui/screen-host.js";
import { CONFIG_STATE_LABELS } from "../../../src/ui/text/settings-labels.js";
import { createTestHost } from "../../support/tui/test-host.js";

// Spied, not replaced: the screens still get what the module installs.
vi.mock("../../../src/ui/tui/screen-host.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../src/ui/tui/screen-host.js")>();
  return { ...original, configureScreens: vi.fn(original.configureScreens) };
});

const INITIAL_TIMEOUT = getInstallTimeoutSeconds();
const INITIAL_CHALK_LEVEL = chalk.level;
let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-settings-module-")), "config.json");
});

afterEach(() => {
  setInstallTimeoutSeconds(INITIAL_TIMEOUT);
  chalk.level = INITIAL_CHALK_LEVEL;
  configureScreens(null);
  setUiPreferencesSource(null);
  vi.restoreAllMocks();
});

async function writeSettings(sections: unknown): Promise<void> {
  await writeFile(file, JSON.stringify({ version: 1, sections }), "utf8");
}

function moduleOver(overrides: Partial<SettingsModuleDeps> = {}): CliModule {
  const settings = new SettingsService(new ConfigStore({ file }));
  return createSettingsModule({
    settings: () => settings,
    env: {},
    isKnownProvider: (providerId) => providerId === "winget",
    ...overrides,
  });
}

/** Run `command` through gup's startup hooks with `modules`; resolves with what the action saw. */
async function run<T>(
  modules: readonly CliModule[],
  command: string,
  observe: () => T,
): Promise<T | undefined> {
  let seen: T | undefined;
  const program = new Command().name("gup").exitOverride();
  for (const name of ["list", ADMIN_BATCH_COMMAND]) {
    program.command(name).action(() => {
      seen = observe();
    });
  }
  installStartup(program, modules);
  await program.parseAsync(["node", "gup", command]);
  return seen;
}

describe("settingsModule", () => {
  it("is one of gup's modules, and never runs in the elevated child", () => {
    expect(CLI_MODULES).toContain(settingsModule);
    expect(settingsModule.runsInElevatedChild).not.toBe(true);
  });

  it("makes the persisted install timeout effective before the command runs", async () => {
    await writeSettings({ install: { v: 1, timeoutSeconds: 600 } });
    expect(await run([moduleOver()], "list", getInstallTimeoutSeconds)).toBe(600);
  });

  it("lets GUP_INSTALL_TIMEOUT win over the file", async () => {
    await writeSettings({ install: { v: 1, timeoutSeconds: 600 } });
    setInstallTimeoutSeconds(90);
    const module = moduleOver({ env: { GUP_INSTALL_TIMEOUT: "90" } });
    expect(await run([module], "list", getInstallTimeoutSeconds)).toBe(90);
  });

  it("never reads the settings for the elevated batch", async () => {
    const settings = vi.fn(() => new SettingsService(new ConfigStore({ file })));
    await run([moduleOver({ settings })], ADMIN_BATCH_COMMAND, () => undefined);
    expect(settings).not.toHaveBeenCalled();
  });

  it("prints each problem with the file once, on stderr, before the command", async () => {
    await writeSettings({
      interface: { v: 1, mouse: "non" },
      scan: { v: 1, providerFilter: ["winget", "gone"] },
    });
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const printedBeforeAction = await run([moduleOver()], "list", () => stderr.mock.calls.length);
    const lines = stderr.mock.calls.map(([chunk]) => String(chunk));
    expect(printedBeforeAction).toBe(2);
    expect(lines[0]).toContain("gup : configuration — interface.mouse : booléen attendu");
    expect(lines[1]).toContain("provider inconnu ignoré : gone");
  });

  it("turns chalk's colours off under NO_COLOR", async () => {
    chalk.level = 2;
    await run([moduleOver({ env: { NO_COLOR: "1" } })], "list", () => undefined);
    expect(chalk.level).toBe(0);
  });

  it("gives the menu its preferences from the file", async () => {
    await writeSettings({
      interface: { v: 1, packageSort: "bump" },
      scan: { v: 1, fast: true, providerFilter: ["winget", "gone"] },
    });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const preferences = await run([moduleOver()], "list", () => uiPreferences().current());
    expect(preferences).toMatchObject({
      packageSort: "bump",
      scan: { fast: true, filter: ["winget"] },
    });
  });

  it("opens the screens with the mouse preference, as it is when they open", async () => {
    const settings = new SettingsService(new ConfigStore({ file }));
    await run([moduleOver({ settings: () => settings })], "list", () => undefined);
    const installed = vi.mocked(configureScreens).mock.calls.at(-1)?.[0];
    expect(installed?.rendererOptions?.()).toEqual({ useMouse: true });
    settings.update("interface", { mouse: false });
    expect(installed?.rendererOptions?.()).toEqual({ useMouse: false });
  });

  it("paints the screens with the theme engine, set to the saved theme", async () => {
    await writeSettings({ theme: { v: 1, id: "dracula" } });
    await run([moduleOver()], "list", () => undefined);
    const { host, next } = createTestHost();
    let finish = (): void => {};
    let appearance: unknown;
    const screen = host.run(async (mounted) => {
      appearance = mounted.appearance;
      mounted.renderer.root.add(new mounted.tui.TextRenderable(mounted.renderer, { content: "x" }));
      return new Promise<void>((resolve) => (finish = resolve));
    });
    await next();
    finish();
    await screen;
    expect(appearance).toBeInstanceOf(ThemedAppearance);
    expect((appearance as ThemedAppearance).resolved.effective).toBe("dracula");
  });
});

describe("settingsModule diagnostics", () => {
  it("reports where the file is and its state", async () => {
    await writeSettings({ theme: { v: 1, id: "dark" } });
    const [line] = (await moduleOver().diagnostics?.()) ?? [];
    expect(line).toEqual({
      label: "Configuration",
      value: `${file} — ${CONFIG_STATE_LABELS.saved}`,
      status: "ok",
    });
  });

  it("warns about invalid settings, and is off when GUP_CONFIG disables the file", async () => {
    await writeSettings({ interface: { v: 1, mouse: "non" } });
    const [invalid] = (await moduleOver().diagnostics?.()) ?? [];
    expect(invalid?.status).toBe("warn");
    const disabled = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
    const [off] = (await moduleOver({ settings: () => disabled }).diagnostics?.()) ?? [];
    expect(off).toEqual({
      label: "Configuration",
      value: CONFIG_STATE_LABELS.disabled,
      status: "off",
    });
  });
});
