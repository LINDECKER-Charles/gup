import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigStore } from "../../../../src/core/config/store.js";
import {
  DEFAULT_INSTALL_TIMEOUT_S,
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../../../../src/core/runner.js";
import { fileSection } from "../../../../src/ui/panels/options/file-section.js";
import { OptionsPanel } from "../../../../src/ui/panels/options/options-panel.js";
import { scanSection } from "../../../../src/ui/panels/options/scan-section.js";
import {
  OPTIONS_NOTICES,
  RESET_DIALOG,
  type ResetScope,
} from "../../../../src/ui/text/settings/options-labels.js";
import { CONFIG_STATE_LABELS } from "../../../../src/ui/text/settings/settings-labels.js";
import {
  key,
  optionsFixture,
  settle,
  text,
  VIEW,
  type FixtureOptions,
} from "./options-fixture.js";

const INITIAL_TIMEOUT_S = getInstallTimeoutSeconds();
afterEach(() => setInstallTimeoutSeconds(INITIAL_TIMEOUT_S));

function setup(options: FixtureOptions = {}) {
  const fixture = optionsFixture(options);
  return { ...fixture, panel: new OptionsPanel([scanSection, fileSection], fixture.host) };
}

async function fileStore(): Promise<{ store: ConfigStore; file: string }> {
  const file = join(await mkdtemp(join(tmpdir(), "gup-options-file-")), "config.json");
  return { store: new ConfigStore({ file }), file };
}

/** Answer the reset dialogs with `scope` and `isConfirmed`, then open them from the list. */
async function reset(
  fixture: ReturnType<typeof setup>,
  answers: { readonly scope: ResetScope | undefined; readonly isConfirmed: boolean },
): Promise<void> {
  fixture.dialogs.choose.mockResolvedValue(answers.scope);
  fixture.dialogs.confirm.mockResolvedValue(answers.isConfirmed);
  for (const name of ["end", "up", "enter"]) fixture.panel.press(key(name));
  await settle();
}

describe("Options file section", () => {
  it("shows the file's state and path, and copies the path with c", async () => {
    const { store, file } = await fileStore();
    const fixture = setup({ store });
    const rendered = text(fixture.panel.render({ width: 240, height: 20 }));
    expect(rendered).toContain(`${CONFIG_STATE_LABELS.defaults}  ${file}`);
    expect(fixture.panel.hints()).toContain("c copier le chemin");
    fixture.panel.press(key("c"));
    expect(fixture.host.copyToClipboard).toHaveBeenCalledWith(file);
    expect(text(fixture.panel.render(VIEW)).split("\n")[0]).toBe(OPTIONS_NOTICES.copied);
  });

  it("says when the terminal cannot take the path", async () => {
    const { store } = await fileStore();
    const fixture = setup({ store });
    vi.mocked(fixture.host.copyToClipboard).mockReturnValue(false);
    fixture.panel.press(key("c"));
    expect(text(fixture.panel.render(VIEW)).split("\n")[0]).toBe(OPTIONS_NOTICES.copyFailed);
  });

  it("says when the file is not used at all", () => {
    expect(text(setup().panel.render(VIEW))).toContain(CONFIG_STATE_LABELS.disabled);
  });

  it("resets the chosen group only, after a confirmation that defaults to Non", async () => {
    const fixture = setup();
    fixture.settings.update("theme", { id: "dark" });
    fixture.settings.update("interface", { density: "compact", mouse: false });
    await reset(fixture, { scope: "appearance", isConfirmed: true });
    expect(fixture.dialogs.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        text: [RESET_DIALOG.confirm(RESET_DIALOG.scopes.appearance.label)],
        default: false,
      }),
    );
    expect(fixture.settings.get("theme").id).toBe("terminal");
    expect(fixture.settings.get("interface")).toMatchObject({ density: "comfortable", mouse: false });
    expect(fixture.host.redraw).toHaveBeenCalled();
  });

  it("changes nothing when the reset is not confirmed", async () => {
    const fixture = setup();
    fixture.settings.update("theme", { id: "dark" });
    await reset(fixture, { scope: "appearance", isConfirmed: false });
    expect(fixture.settings.get("theme").id).toBe("dark");
  });

  it("asks nothing more when no group is chosen", async () => {
    const fixture = setup();
    await reset(fixture, { scope: undefined, isConfirmed: true });
    expect(fixture.dialogs.confirm).not.toHaveBeenCalled();
  });

  it("puts the comfort settings back, mouse included on this screen", async () => {
    const fixture = setup();
    fixture.settings.update("interface", { mouse: false, packageSort: "bump", density: "compact" });
    await reset(fixture, { scope: "comfort", isConfirmed: true });
    expect(fixture.settings.get("interface")).toMatchObject({
      mouse: true,
      packageSort: "provider",
      density: "compact",
    });
    expect(fixture.host.setMouse).toHaveBeenCalledWith(true);
  });

  it("puts the scan settings back in the session too, and offers a rescan", async () => {
    const fixture = setup();
    fixture.settings.update("scan", { fast: true, providerFilter: ["pip"] });
    fixture.state.fast = true;
    fixture.state.filter = ["pip"];
    setInstallTimeoutSeconds(90);
    await reset(fixture, { scope: "all", isConfirmed: true });
    expect(fixture.state).toMatchObject({ fast: false, filter: [] });
    expect(getInstallTimeoutSeconds()).toBe(DEFAULT_INSTALL_TIMEOUT_S);
    expect(text(fixture.panel.render(VIEW))).toContain(OPTIONS_NOTICES.rescan);
  });

  it("keeps the environment's timeout over the reset file value", async () => {
    const fixture = setup({ env: { GUP_INSTALL_TIMEOUT: "60" } });
    setInstallTimeoutSeconds(60);
    await reset(fixture, { scope: "scan", isConfirmed: true });
    expect(getInstallTimeoutSeconds()).toBe(60);
  });
});
