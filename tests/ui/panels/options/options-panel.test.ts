import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NODE_FILE_OPS, type FileOps } from "../../../../src/core/config/atomic-write.js";
import { ConfigStore } from "../../../../src/core/config/store.js";
import {
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../../../../src/core/runner.js";
import { appearanceSection } from "../../../../src/ui/panels/options/appearance-section.js";
import { comfortSection } from "../../../../src/ui/panels/options/comfort-section.js";
import { fileSection } from "../../../../src/ui/panels/options/file-section.js";
import type { SectionFactory } from "../../../../src/ui/panels/options/option-row.js";
import { OptionsPanel } from "../../../../src/ui/panels/options/options-panel.js";
import { scanSection } from "../../../../src/ui/panels/options/scan-section.js";
import { TIMEOUT_DIALOG } from "../../../../src/ui/text/menu-labels.js";
import {
  FILTER_VIEW,
  OPTIONS_NOTICES,
  OPTIONS_SECTIONS,
  TIMEOUT_OUT_OF_RANGE,
} from "../../../../src/ui/text/options-labels.js";
import { seg } from "../../../../src/ui/tui/styled-lines.js";
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

const SECTIONS: readonly SectionFactory[] = [
  scanSection,
  appearanceSection,
  comfortSection,
  fileSection,
];

function setup(options: FixtureOptions = {}, sections = SECTIONS) {
  const fixture = optionsFixture(options);
  return { ...fixture, panel: new OptionsPanel(sections, fixture.host) };
}

function press(panel: OptionsPanel, ...names: string[]): void {
  for (const name of names) panel.press(key(name));
}

/** The row under the cursor, as text. */
function cursorRow(panel: OptionsPanel): string {
  return text(panel.render(VIEW)).split("\n").find((line) => line.startsWith("›")) ?? "";
}

describe("OptionsPanel list", () => {
  it("lists its sections in order and starts on the first row", () => {
    const { panel } = setup();
    const titles = text(panel.render(VIEW))
      .split("\n")
      .filter((line) => Object.values(OPTIONS_SECTIONS).includes(line.trim() as never));
    expect(titles).toEqual([
      OPTIONS_SECTIONS.scan,
      OPTIONS_SECTIONS.appearance,
      OPTIONS_SECTIONS.comfort,
      OPTIONS_SECTIONS.file,
    ]);
    expect(cursorRow(panel)).toContain("Mode rapide");
  });

  it("skips the section headers and blank rows when the cursor moves", () => {
    const { panel } = setup();
    press(panel, "down", "down", "down");
    expect(cursorRow(panel)).toContain("Thème");
    press(panel, "up");
    expect(cursorRow(panel)).toContain("Filtre providers");
  });

  it("toggles a switch with Entrée, saves it, and offers a rescan for scan settings", () => {
    const { panel, state, settings, host } = setup();
    press(panel, "enter");
    expect(state.fast).toBe(true);
    expect(settings.get("scan").fast).toBe(true);
    expect(text(panel.render(VIEW))).toContain(OPTIONS_NOTICES.rescan);
    expect(panel.hints()).toContain("r rescanner");
    press(panel, "r");
    expect(host.rescan).toHaveBeenCalledOnce();
    expect(text(panel.render(VIEW))).not.toContain(OPTIONS_NOTICES.rescan);
  });

  it("steps a value with ← →, claiming the arrows only on rows that step", () => {
    const { panel, settings } = setup();
    press(panel, "down", "down", "down");
    expect(panel.wantsKey(key("left"))).toBe(false);
    press(panel, "down");
    expect(cursorRow(panel)).toContain("Niveau de contraste");
    expect(panel.wantsKey(key("left"))).toBe(true);
    press(panel, "right");
    expect(settings.get("theme").contrast).toBe("AAA");
    press(panel, "left");
    expect(settings.get("theme").contrast).toBe("AA");
  });

  it("writes each comfort row to the interface settings, the mouse switching at once", () => {
    const { panel, settings, host } = setup();
    press(panel, "end", "up", "up", "up");
    expect(cursorRow(panel)).toContain("Souris");
    press(panel, "enter");
    expect(settings.get("interface").mouse).toBe(false);
    expect(host.setMouse).toHaveBeenCalledWith(false);
    press(panel, "up", "up", "up", "up", "right");
    expect(cursorRow(panel)).toContain("[Nom]");
    expect(settings.get("interface").packageSort).toBe("name");
  });

  it("places the sections other features add between the comfort and file sections", () => {
    const extra: SectionFactory = () => ({ id: "journal", title: "JOURNAL", rows: () => [] });
    const { panel } = setup({}, [scanSection, appearanceSection, comfortSection, extra, fileSection]);
    const rendered = text(panel.render({ width: 100, height: 60 }));
    expect(rendered.indexOf("CONFORT")).toBeLessThan(rendered.indexOf("JOURNAL"));
    expect(rendered.indexOf("JOURNAL")).toBeLessThan(rendered.indexOf("FICHIER"));
  });

  it("drops the blank rows between sections in compact density", () => {
    const { panel } = setup({ density: "compact" });
    const lines = text(panel.render(VIEW)).split("\n");
    expect(lines[lines.indexOf(OPTIONS_SECTIONS.appearance) - 1]).toContain("Filtre providers");
  });

  it("keeps the cursor in view when the list is taller than the panel", () => {
    const { panel } = setup();
    const short = { width: 100, height: 10 };
    press(panel, "end");
    const rendered = text(panel.render(short));
    expect(rendered).toContain("› Fichier");
    expect(rendered).not.toContain("Mode rapide");
    expect(panel.render(short)).toHaveLength(10);
  });

  it("activates the row a click lands on, and moves with the wheel", () => {
    const { panel, state } = setup();
    panel.click(1, VIEW);
    expect(state.fast).toBe(true);
    panel.scroll(1);
    expect(cursorRow(panel)).toContain("Timeout install");
  });
});

describe("OptionsPanel saving", () => {
  /** A disk full on the first save, with room again on the next. */
  async function flakyStore(): Promise<ConfigStore> {
    let failures = 1;
    const fileOps: FileOps = {
      ...NODE_FILE_OPS,
      renameSync: (...args) => {
        if (failures-- > 0) throw Object.assign(new Error("ENOSPC: disque plein"), { code: "ENOSPC" });
        NODE_FILE_OPS.renameSync(...args);
      },
    };
    const dir = await mkdtemp(join(tmpdir(), "gup-options-"));
    return new ConfigStore({ file: join(dir, "config.json"), fileOps });
  }

  it("keeps a value it could not save, says so above the list, and clears it on the next save", async () => {
    const { panel, state, settings } = setup({ store: await flakyStore() });
    press(panel, "enter");
    expect(state.fast).toBe(true);
    expect(settings.get("scan").fast).toBe(true);
    const first = text(panel.render(VIEW)).split("\n")[0];
    expect(first).toContain("⚠ Réglage non enregistré");
    expect(first).toContain("ENOSPC");
    press(panel, "enter");
    expect(text(panel.render(VIEW))).not.toContain("non enregistré");
  });
});

describe("OptionsPanel scan settings", () => {
  it("asks for the timeout, applies it to the session and saves it", async () => {
    const { panel, dialogs, settings, host } = setup();
    dialogs.ask.mockResolvedValue("90");
    press(panel, "down", "enter");
    await settle();
    expect(getInstallTimeoutSeconds()).toBe(90);
    expect(settings.get("install").timeoutSeconds).toBe(90);
    expect(host.redraw).toHaveBeenCalled();
    expect(cursorRow(panel)).toContain("[90s]");
  });

  it("refuses a timeout the settings file could not keep", () => {
    const { panel, dialogs } = setup();
    dialogs.ask.mockResolvedValue(undefined);
    press(panel, "down", "enter");
    const { validate } = dialogs.ask.mock.calls[0]?.[0] as { validate(v: string): unknown };
    expect(validate("abc")).toBe(TIMEOUT_DIALOG.invalid);
    expect(validate("-1")).toBe(TIMEOUT_DIALOG.invalid);
    expect(validate("1.5")).toBe(TIMEOUT_OUT_OF_RANGE);
    expect(validate("86401")).toBe(TIMEOUT_OUT_OF_RANGE);
    expect(validate("0")).toBe(true);
  });

  it("edits the provider filter in place, saves it, and offers a rescan", () => {
    const { panel, state, settings } = setup();
    press(panel, "down", "down", "enter");
    expect(panel.title).toBe(`Options › ${FILTER_VIEW.title}`);
    expect(panel.wantsKey(key("left"))).toBe(true);
    press(panel, "down", "space");
    expect(state.filter).toEqual(["pip"]);
    expect(settings.get("scan").providerFilter).toEqual(["pip"]);
    press(panel, "escape");
    expect(cursorRow(panel)).toContain("[1 choisi(s)]");
    expect(text(panel.render(VIEW))).toContain(OPTIONS_NOTICES.rescan);
  });

  it("says when no provider was detected yet", () => {
    const { panel, state } = setup();
    state.providers = [];
    press(panel, "down", "down", "enter");
    expect(text(panel.render(VIEW))).toContain(FILTER_VIEW.empty);
  });
});

describe("OptionsPanel notices", () => {
  it("shows what a section tells the user above the list", () => {
    const notice: SectionFactory = (controls) => ({
      id: "notice",
      title: "NOTE",
      rows: () => [],
      shortcuts: () => [
        { key: "x", hint: "x essayer", run: () => controls.notify([seg("bonjour", "success")]) },
      ],
    });
    const { panel } = setup({}, [scanSection, notice]);
    expect(panel.hints()).toContain("x essayer");
    press(panel, "x");
    expect(text(panel.render(VIEW)).split("\n")[0]).toBe("bonjour");
  });
});
