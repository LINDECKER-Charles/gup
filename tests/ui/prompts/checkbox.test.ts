import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkbox, type CheckboxGroup } from "../../../src/ui/prompts/checkbox.js";
import { createTestHost, frame, press } from "../tui-test-host.js";

const GROUPS: CheckboxGroup<string>[] = [
  {
    title: "winget",
    choices: [
      { label: "Git.Git", hint: "2.51.0 → 2.52.0", value: "git" },
      { label: "Microsoft.PowerShell", hint: "7.5.3 → 7.5.4", value: "pwsh" },
    ],
  },
  { title: "npm-g", choices: [{ label: "typescript", value: "ts" }] },
];

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

describe("checkbox", () => {
  it("toggles the row under the cursor and resolves the checked values", async () => {
    const { host, next } = createTestHost();
    const answer = checkbox({ message: "Paquets", groups: GROUPS }, host);
    const screen = await next();

    // Rows: [winget] Git.Git PowerShell [npm-g] typescript
    await press(screen, "down", "space", "down", "down", "down", "space", "enter");

    await expect(answer).resolves.toEqual(["git", "ts"]);
  });

  it("checks a whole group from its header, and unchecks it the second time", async () => {
    const { host, next } = createTestHost();
    const answer = checkbox({ message: "Paquets", groups: GROUPS }, host);
    const screen = await next();

    await press(screen, "space");
    expect(await frame(screen)).toContain("2/3");
    await press(screen, "space", "space", "enter");

    await expect(answer).resolves.toEqual(["git", "pwsh"]);
  });

  it("toggles everything with `a`", async () => {
    const { host, next } = createTestHost();
    const answer = checkbox({ message: "Paquets", groups: GROUPS }, host);

    await press(await next(), "a", "enter");

    await expect(answer).resolves.toEqual(["git", "pwsh", "ts"]);
  });

  it("starts from the pre-checked choices and draws ungrouped lists without headers", async () => {
    const { host, next } = createTestHost();
    const flat: CheckboxGroup<string>[] = [
      { title: "", choices: [{ label: "Scoop", value: "scoop", checked: true }, { label: "pip", value: "pip" }] },
    ];
    const answer = checkbox({ message: "Providers", groups: flat }, host);
    const screen = await next();

    expect(await frame(screen)).toContain("1/2");
    await press(screen, "enter");

    await expect(answer).resolves.toEqual(["scoop"]);
  });
});
