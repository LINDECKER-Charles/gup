import { describe, expect, it } from "vitest";
import {
  neededProviders,
  planTick,
  SKIP_REASONS,
  type TickPlanInput,
} from "../../../src/core/scheduler/model/tick-plan.js";
import { pkg, scan } from "../../support/builders.js";
import { providerFacts, schedule, target } from "./scheduler-fixtures.js";

const providers = providerFacts({
  winget: {},
  "npm-g": {},
  nvim: {},
  choco: { displayName: "Chocolatey", canUpdateUnattended: false },
});

function plan(overrides: Partial<TickPlanInput>) {
  return planTick({
    due: [],
    scans: [],
    available: new Set(["winget", "npm-g", "nvim"]),
    providers,
    ...overrides,
  });
}

const resolvedOf = (input: Partial<TickPlanInput>) => [...plan(input).resolved.values()];

describe("planTick", () => {
  it("updates an outdated target with the scan's own row", () => {
    const due = [schedule({ targets: [target("winget", "git.git")] })];
    const row = pkg("Git.Git", { current: "2.46.0", latest: "2.47.0" });
    const result = plan({ due, scans: [scan("winget", [row])] });
    expect(result.updates).toEqual([
      { providerId: "winget", pkg: row, targets: ["winget:git.git"], scheduleIds: ["a1b2c3d4"] },
    ]);
    expect(result.resolved.size).toBe(0);
  });

  it("prefers the exact id over a case-insensitive one", () => {
    const due = [schedule({ targets: [target("npm-g", "Foo")] })];
    const rows = [pkg("foo"), pkg("Foo")];
    expect(plan({ due, scans: [scan("npm-g", rows)] }).updates[0]?.pkg).toBe(rows[1]);
  });

  it("updates a package once when two schedules list it", () => {
    const first = schedule({ id: "aaaaaaaa", targets: [target("winget", "Git.Git")] });
    const second = schedule({ id: "bbbbbbbb", targets: [target("winget", "git.git")] });
    const result = plan({ due: [first, second], scans: [scan("winget", [pkg("Git.Git")])] });
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({
      targets: ["winget:Git.Git", "winget:git.git"],
      scheduleIds: ["aaaaaaaa", "bbbbbbbb"],
    });
  });

  it("settles each case of the decision table without installing", () => {
    const due = [
      schedule({
        targets: [
          target("brew", "git"),
          target("choco", "vlc"),
          target("npm-g", "typescript"),
          target("nvim", "all"),
          target("winget", "Admin.App"),
          target("winget", "Fresh.App"),
        ],
      }),
    ];
    const scans = [
      scan("nvim", [pkg("all", { aggregate: true })]),
      scan("winget", [pkg("Admin.App", { requiresAdmin: true })]),
    ];
    const available = new Set(["nvim", "winget"]);
    expect(resolvedOf({ due, scans, available })).toEqual([
      { target: "brew:git", status: "skipped", message: "Provider inconnu: brew" },
      { target: "choco:vlc", status: "skipped", message: SKIP_REASONS.adminOnly("Chocolatey") },
      { target: "npm-g:typescript", status: "skipped", message: SKIP_REASONS.notDetected },
      { target: "nvim:all", status: "skipped", message: SKIP_REASONS.aggregate },
      { target: "winget:Admin.App", status: "skipped", message: SKIP_REASONS.requiresAdmin },
      { target: "winget:Fresh.App", status: "no-update" },
    ]);
  });

  it("skips the targets of a provider whose scan failed", () => {
    const due = [schedule({ targets: [target("winget", "Git.Git")] })];
    const scans = [scan("winget", [], { error: "réseau indisponible" })];
    expect(resolvedOf({ due, scans })).toEqual([
      {
        target: "winget:Git.Git",
        status: "skipped",
        message: "scan du provider en échec : réseau indisponible",
      },
    ]);
  });

  it("reports the environment down only when every installed needed provider failed", () => {
    const due = [schedule({ targets: [target("winget", "a"), target("npm-g", "b")] })];
    const failed = (id: string) => scan(id, [], { error: "offline" });
    expect(plan({ due, scans: [failed("winget"), failed("npm-g")] }).isEnvironmentDown).toBe(true);
    expect(plan({ due, scans: [failed("winget"), scan("npm-g")] }).isEnvironmentDown).toBe(false);
    const onlyWinget = new Set(["winget"]);
    const down = plan({ due, scans: [failed("winget")], available: onlyWinget });
    expect(down.isEnvironmentDown).toBe(true);
    expect(plan({ due, scans: [], available: new Set() }).isEnvironmentDown).toBe(false);
  });
});

describe("neededProviders", () => {
  it("lists each known provider once, never the unknown or admin-only ones", () => {
    const due = [
      schedule({ targets: [target("winget", "a"), target("brew", "b"), target("choco", "c")] }),
      schedule({ targets: [target("winget", "d"), target("npm-g", "e")] }),
    ];
    expect(neededProviders(due, providers)).toEqual(["winget", "npm-g"]);
  });
});
