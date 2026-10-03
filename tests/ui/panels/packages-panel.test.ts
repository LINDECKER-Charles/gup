import { describe, expect, it, vi } from "vitest";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { PackageList } from "../../../src/ui/panels/package-list.js";
import { PackagesPanel } from "../../../src/ui/panels/packages-panel.js";
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

function panel() {
  const onSubmit = vi.fn();
  const view = new PackagesPanel(onSubmit);
  view.setList(new PackageList(SCANS, () => "Winget"));
  return { view, onSubmit };
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
    const view = new PackagesPanel(vi.fn());
    view.setList(new PackageList([], (id) => id));
    expect(text(view.render(VIEW))).toContain("Tout est à jour.");
  });
});
