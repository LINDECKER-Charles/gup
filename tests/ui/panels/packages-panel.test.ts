import { describe, expect, it, vi } from "vitest";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { PackageList } from "../../../src/ui/panels/package-list.js";
import type { PackageAction } from "../../../src/ui/app/view-definition.js";
import {
  PackagesPanel,
  type PackagesOptions,
} from "../../../src/ui/panels/packages-panel.js";
import type { KeyPress } from "../../../src/ui/tui/screen-host.js";

const key = (name: string, sequence = name): KeyPress => ({ name, sequence, ctrl: false });
const text = (lines: readonly (readonly { text: string }[])[]) =>
  lines.map((l) => l.map((s) => s.text).join("")).join("\n");
const VIEW = { width: 100, height: 20 };
const SCANS: ProviderScanResult[] = [
  {
    providerId: "winget",
    available: true,
    packages: [
      { id: "Git.Git", current: "2.51.0", latest: "2.52.0" },
      { id: "7zip.7zip", current: "25.00", latest: "25.01", note: "pinned" },
    ],
  },
];

function panel(options: PackagesOptions = {}) {
  const onSubmit = vi.fn();
  const onRescan = vi.fn();
  const view = new PackagesPanel({ onLaunch: onSubmit, onRescan }, options);
  view.setList(new PackageList(SCANS, () => "Winget"));
  return { view, onSubmit, onRescan };
}

function scheduleAction() {
  const run = vi.fn<PackageAction["run"]>();
  const action: PackageAction = {
    key: "p",
    hint: "p planifier",
    emptyNotice: "cochez d'abord des paquets",
    run,
  };
  return { ...action, run };
}

describe("PackagesPanel", () => {
  it("draws a table with the cursor marked and versions in columns", () => {
    const out = text(panel().view.render(VIEW));
    expect(out).toContain("Paquet");
    expect(out).toMatch(/› \[ \] Winget {2}0\/2/);
    expect(out).toMatch(/Git\.Git +2\.51\.0 +→ 2\.52\.0/);
    expect(out).toContain("pinned");
  });

  it("submits the checked packages on Enter", () => {
    const { view, onSubmit } = panel();
    for (const k of ["down", "space", "down", "space", "return"]) view.press(key(k));
    expect(onSubmit.mock.calls[0]![0].map((s: { pkg: { id: string } }) => s.pkg.id)).toEqual([
      "Git.Git",
      "7zip.7zip",
    ]);
  });

  it("submits the package under the cursor when nothing is checked", () => {
    const { view, onSubmit } = panel();
    view.press(key("down"));
    view.press(key("return"));
    expect(onSubmit.mock.calls[0]![0].map((s: { pkg: { id: string } }) => s.pkg.id)).toEqual([
      "Git.Git",
    ]);
  });

  it("filters while typing after /, without treating letters as commands", () => {
    const { view } = panel();
    view.press(key("/", "/"));
    expect(view.isCapturingText).toBe(true);
    for (const c of "7z") view.press(key(c, c));
    view.press(key("return"));
    const out = text(view.render(VIEW));
    expect(out).toContain("/ 7z");
    expect(out).toContain("7zip.7zip");
    expect(out).not.toContain("Git.Git");
  });

  it("toggles the clicked row", () => {
    const { view, onSubmit } = panel();
    // Content rows: 0 = column header, 1 = Winget, 2 = Git.Git, 3 = 7zip.7zip
    view.click(3, VIEW);
    view.press(key("return"));
    expect(onSubmit.mock.calls[0]![0].map((s: { pkg: { id: string } }) => s.pkg.id)).toEqual([
      "7zip.7zip",
    ]);
  });

  it("says when everything is up to date", () => {
    const view = new PackagesPanel({ onLaunch: vi.fn() });
    view.setList(new PackageList([], (id) => id));
    expect(text(view.render(VIEW))).toContain("Tout est à jour.");
  });

  it("rescans on r", () => {
    const { view, onRescan } = panel();
    view.press(key("r"));
    expect(onRescan).toHaveBeenCalledOnce();
    expect(view.hints()).toContain("r rescanner");
  });

  it("runs another view's action on the checked packages only", () => {
    const action = scheduleAction();
    const { view } = panel({ actions: () => [action] });
    expect(view.hints()).toContain("p planifier");
    view.press(key("p"));
    expect(action.run).not.toHaveBeenCalled();
    expect(text(view.render(VIEW))).toContain("cochez d'abord des paquets");
    view.press(key("down"));
    expect(text(view.render(VIEW))).not.toContain("cochez d'abord des paquets");
    for (const k of ["space", "p"]) view.press(key(k));
    expect(action.run.mock.calls[0]![0].map((s) => s.pkg.id)).toEqual(["Git.Git"]);
  });

  it("never lets an action take a key of the table", () => {
    const action = { ...scheduleAction(), key: "a", hint: "a voler" };
    const { view } = panel({ actions: () => [action] });
    view.press(key("down"));
    view.press(key("a"));
    expect(action.run).not.toHaveBeenCalled();
    expect(view.hints()).not.toContain("a voler");
  });

  it("adds a mark column only when a package has a mark", () => {
    const scheduled = {
      glyphFor: (_id: string, pkg: { id: string }) => (pkg.id === "Git.Git" ? "◷" : null),
    };
    const marked = text(panel({ markers: () => [scheduled] }).view.render(VIEW));
    expect(marked).toContain("[ ] ◷ Git.Git");
    expect(marked).toContain("[ ]   7zip.7zip");
    const none = { glyphFor: () => null };
    expect(text(panel({ markers: () => [none] }).view.render(VIEW))).toContain("[ ] Git.Git");
  });

  it("hides the Note column when the preference says so", () => {
    expect(text(panel({ noteColumn: () => "hidden" }).view.render(VIEW))).not.toContain("pinned");
  });
});
