import { describe, expect, it } from "vitest";
import type { PlannedUpdate } from "../../../src/core/update/update-ports.js";
import {
  runFacts,
  statusLines,
  wantedStatusRows,
  type StatusView,
} from "../../../src/ui/run/run-lines.js";
import { RunModel } from "../../../src/ui/run/run-model.js";
import { RUN_NOTICES } from "../../../src/ui/text/run-key-labels.js";
import { RUN_MESSAGES } from "../../../src/ui/text/run-labels.js";
import { STATUS_GLYPHS } from "../../../src/ui/theme/glyphs.js";
import type { Line } from "../../../src/ui/tui/styled-lines.js";
import { outcome, pkg } from "../../support/builders.js";
import { useLocale } from "../../support/locale.js";

const WIDTH = 80;

function planned(packageId: string, isAdmin = false): PlannedUpdate {
  return {
    providerId: isAdmin ? "choco" : "winget",
    packageId,
    key: `${isAdmin ? "choco" : "winget"}:${packageId}`,
    providerName: isAdmin ? "Chocolatey" : "Winget",
    pkg: pkg(packageId, { current: "1.0", latest: "2.0" }),
  };
}

function view(overrides: Partial<StatusView> = {}): StatusView {
  return {
    width: WIDTH,
    rows: 30,
    focus: null,
    cursor: null,
    frame: 0,
    now: 0,
    elevation: "uac",
    notice: null,
    promptHint: null,
    isEnlarged: false,
    ...overrides,
  };
}

const text = (lines: readonly Line[]): string[] =>
  lines.map((line) => line.map((segment) => segment.text).join(""));

/** A run of `ids` on a frozen clock, plus its planned items. */
function run(ids: readonly string[], admin: readonly string[] = []) {
  const model = new RunModel(() => 0);
  const direct = ids.map((id) => planned(id));
  const elevated = admin.map((id) => planned(id, true));
  model.planned({ direct, elevated });
  return { model, direct, elevated };
}

describe("statusLines", () => {
  it("draws the progress, the counters and one aligned row per package", () => {
    const { model, direct } = run(["Git.Git", "7zip.7zip"]);
    model.started({ item: direct[0]! });
    model.finished({ item: direct[0]!, outcome: outcome("Git.Git"), durationMs: 14_000 });
    const [header, gap, git, zip] = text(statusLines(model, view()).lines);
    expect(header).toMatch(/^█+░+ {3}1\/2 {3}√ 1 {3}→ 0 {3}× 0 +00:00$/);
    expect(header).toHaveLength(WIDTH);
    expect(gap).toBe("");
    expect(git).toMatch(/^√ Git\.Git +Winget {2}1\.0 → 2\.0 +00:14$/);
    expect(zip).toMatch(/^· 7zip\.7zip +Winget {2}1\.0 → 2\.0 *$/);
    expect(git!.indexOf("Winget")).toBe(zip!.indexOf("Winget"));
  });

  it("explains a failure under its row, with the retry offer while the run goes on", () => {
    const { model, direct } = run(["7zip.7zip"]);
    const failed = outcome("7zip.7zip", { success: false, message: "hash invalide", retryable: true });
    model.finished({ item: direct[0]!, outcome: failed });
    expect(text(statusLines(model, view()).lines)[3]).toBe(
      `  └ ${RUN_MESSAGES.retryable("hash invalide")}`,
    );
    model.markDone();
    expect(text(statusLines(model, view()).lines)[3]).toBe("  └ hash invalide");
  });

  it("tags admin packages, the elevated wait and retries", () => {
    const { model, direct, elevated } = run(["7zip.7zip"], ["nodejs"]);
    model.elevationStarted(elevated);
    expect(text(statusLines(model, view()).lines)[3]).toMatch(/nodejs .* fenêtre admin…$/);
    expect(text(statusLines(model, view({ elevation: "sudo" })).lines)[3]).toMatch(/sudo…$/);
    model.started({ item: direct[0]!, retry: "force" });
    expect(text(statusLines(model, view()).lines)[2]).toMatch(/ retry --force {2}00:00$/);
  });

  it("marks cancelled packages and counts them apart", () => {
    const { model, direct } = run(["a", "b"]);
    model.cancelled(direct);
    const lines = text(statusLines(model, view()).lines);
    expect(lines[0]).toContain("▪ 2");
    expect(lines.slice(2)).toEqual([
      expect.stringMatching(/^▪ a /),
      `  └ ${RUN_MESSAGES.cancelled}`,
      expect.stringMatching(/^▪ b /),
      `  └ ${RUN_MESSAGES.cancelled}`,
    ]);
  });

  it("puts a notice in place of the blank row, and the prompt hint under the package in flight", () => {
    const { model, direct } = run(["a", "b"]);
    model.started({ item: direct[0]! });
    const notice = { text: RUN_NOTICES.quit, tone: "warning" } as const;
    const lines = text(statusLines(model, view({ notice, promptHint: RUN_NOTICES.prompt })).lines);
    expect(lines[1]).toBe(RUN_NOTICES.quit);
    expect(lines[3]).toBe(`  ${STATUS_GLYPHS.warning} ${RUN_NOTICES.prompt}`);
    expect(lines[4]).toMatch(/^· b /);
  });

  it("cuts a notice too long for its row in the middle, so its end stays", () => {
    const { model } = run(["a"]);
    const path = "~/AppData/Local/gup/reports/gup-report-20261004-113309.html";
    const notice = { text: `√ Export écrit — ${path}`, tone: "success" } as const;
    const [, line] = text(statusLines(model, view({ notice, width: 60 })).lines);
    expect(line).toHaveLength(60);
    expect(line).toMatch(/^√ Export écrit — ~.*…/);
    expect(line).toMatch(/\/gup-report-20261004-113309\.html$/);
  });

  it("keeps the focused package in view when the list does not fit", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `p${index}`);
    const { model } = run(ids);
    const { lines, rowItems } = statusLines(model, view({ rows: 7, focus: 20 }));
    expect(lines).toHaveLength(7);
    expect(rowItems.slice(2)).toEqual([18, 19, 20, 21, 22]);
  });

  it("shows only the header and the package in flight when the terminal is enlarged", () => {
    const { model, direct } = run(["a", "b", "c"]);
    model.started({ item: direct[1]! });
    const lines = text(statusLines(model, view({ isEnlarged: true, focus: 1 })).lines);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^│ b /);
  });

  it("sums the run up and marks the selected package on the results", () => {
    const { model, direct } = run(["a", "b"]);
    model.finished({ item: direct[0]!, outcome: outcome("a") });
    model.finished({ item: direct[1]!, outcome: outcome("b", { success: false }) });
    model.markDone();
    const lines = text(statusLines(model, view({ cursor: 1, focus: 1 })).lines);
    expect(lines[0]).toMatch(/^√ 1 mis à jour {3}→ 0 ignorée {3}× 1 échec +en 00:00$/);
    expect(lines[2]).toMatch(/^ {2}√ a /);
    expect(lines[3]).toMatch(/^› × b /);
  });

  it("mutes a count of zero: nothing updated is not a success", () => {
    const { model, direct } = run(["a"]);
    model.started({ item: direct[0]! });
    const tones = (line: Line | undefined) =>
      Object.fromEntries((line ?? []).map((segment) => [segment.text.trim(), segment.tone]));
    expect(tones(statusLines(model, view()).lines[0])).toMatchObject({
      "√ 0": "muted",
      "→ 0": "muted",
      "× 0": "muted",
    });
    model.finished({ item: direct[0]!, outcome: outcome("a", { success: false }) });
    model.markDone();
    const [summary] = statusLines(model, view()).lines;
    expect(tones(summary)).toMatchObject({
      "√ 0 mis à jour": "muted",
      "× 1 échec": "danger",
    });
  });

  it("says who holds the update batch while the run waits", () => {
    const { model } = run(["a"]);
    const startedAt = new Date(2026, 9, 3, 8, 0).toISOString();
    model.waiting({ kind: "scheduled", pid: 7, startedAt });
    const now = new Date(2026, 9, 3, 8, 4).getTime();
    const [header] = text(statusLines(model, view({ now, width: 100 })).lines);
    expect(header).toMatch(
      /^│ Une mise à jour planifiée est en cours \(commencée il y a 4 min\) — attente… +00:00$/,
    );
  });
});

describe("the run's status in English", () => {
  useLocale("en");

  it("sums the run up, each count agreeing with its number", () => {
    const { model, direct } = run(["a", "b", "c"]);
    model.finished({ item: direct[0]!, outcome: outcome("a") });
    for (const item of direct.slice(1)) {
      model.finished({ item, outcome: outcome(item.packageId, { success: false }) });
    }
    model.markDone();
    const [header] = text(statusLines(model, view()).lines);
    expect(header).toMatch(/^√ 1 updated {3}→ 0 skipped {3}× 2 failed +in 00:00$/);
    expect(runFacts(model)).toEqual(["Update finished", "3 packages", "00:00"]);
  });

  it("says who holds the update batch while the run waits", () => {
    const { model } = run(["a"]);
    const startedAt = new Date(2026, 9, 3, 8, 0).toISOString();
    model.waiting({ kind: "scheduled", pid: 7, startedAt });
    const now = new Date(2026, 9, 3, 8, 4).getTime();
    const [header] = text(statusLines(model, view({ now, width: 100 })).lines);
    expect(header).toMatch(
      /^│ A scheduled update is running \(started 4 min ago\) — waiting… +00:00$/,
    );
  });
});

describe("wantedStatusRows", () => {
  it("counts the header, the gap and every package's rows", () => {
    const { model, direct } = run(["a", "b"]);
    model.finished({ item: direct[0]!, outcome: outcome("a", { success: false, message: "x" }) });
    expect(wantedStatusRows(model, view())).toBe(2 + 2 + 1);
  });
});
