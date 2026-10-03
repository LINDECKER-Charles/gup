import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirm } from "../../../src/ui/prompts/confirm.js";
import { input } from "../../../src/ui/prompts/input.js";
import { createTestHost, frame, press } from "../tui-test-host.js";

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

describe("confirm", () => {
  it("answers the default on Enter", async () => {
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continuer ?", default: false }, host);

    await press(await next(), "enter");

    await expect(answer).resolves.toBe(false);
  });

  it("answers at once on `n` and on `o`", async () => {
    const { host, next } = createTestHost();
    const no = confirm({ message: "Continuer ?" }, host);
    await press(await next(), "n");
    await expect(no).resolves.toBe(false);

    const yes = confirm({ message: "Continuer ?", default: false }, host);
    await press(await next(), "o");
    await expect(yes).resolves.toBe(true);
  });

  it("switches side with the arrows before Enter", async () => {
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continuer ?" }, host);

    await press(await next(), "right", "enter");

    await expect(answer).resolves.toBe(false);
  });
});

describe("input", () => {
  it("resolves the trimmed text on Enter", async () => {
    const { host, next } = createTestHost();
    const answer = input({ message: "Cible(s)" }, host);
    const screen = await next();

    await screen.mockInput.typeText("  winget:Git.Git ");
    await press(screen, "enter");

    await expect(answer).resolves.toBe("winget:Git.Git");
  });

  it("keeps the field open and shows why while the value is refused", async () => {
    const { host, next } = createTestHost();
    const answer = input(
      { message: "Timeout", default: "", validate: (v) => /^\d+$/.test(v) || "nombre attendu" },
      host,
    );
    const screen = await next();

    await press(screen, "enter");
    expect(await frame(screen)).toContain("nombre attendu");
    await screen.mockInput.typeText("30");
    await press(screen, "enter");

    await expect(answer).resolves.toBe("30");
  });
});
