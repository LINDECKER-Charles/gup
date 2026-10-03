import { afterEach, describe, expect, it, vi } from "vitest";
import { confirm } from "../../../src/ui/prompts/confirm.js";
import { select } from "../../../src/ui/prompts/select.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { createTestHost, frame, press } from "../tui-test-host.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const quiet = () => vi.spyOn(process.stdout, "write").mockReturnValue(true);

describe("confirm", () => {
  it("answers the highlighted button on Enter and leaves a line in the scrollback", async () => {
    const write = quiet();
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continuer ?", default: false }, host);
    await press(await next(), "enter");
    await expect(answer).resolves.toBe(false);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Continuer ?"));
  });

  it("answers at once on o / n, and switches side with the arrows", async () => {
    quiet();
    const { host, next } = createTestHost();
    const yes = confirm({ message: "Continuer ?", default: false }, host);
    await press(await next(), "o");
    await expect(yes).resolves.toBe(true);
    const switched = confirm({ message: "Continuer ?" }, host);
    await press(await next(), "right", "enter");
    await expect(switched).resolves.toBe(false);
  });

  it("rejects with PromptCancelledError on Ctrl+C", async () => {
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continuer ?" }, host);
    await press(await next(), "ctrl+c");
    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
  });
});

describe("select", () => {
  const CHOICES = [
    { label: "Aucun", value: "none" },
    { label: "--force", value: "force", description: "Ignore le hash de l'installeur." },
  ];

  it("shows the highlighted choice's description and resolves the chosen value", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = select({ message: "Stratégie", choices: CHOICES, default: "none" }, host);
    const screen = await next();
    await press(screen, "down");
    expect(await frame(screen)).toContain("Ignore le hash de l'installeur.");
    await press(screen, "enter");
    await expect(answer).resolves.toBe("force");
  });

  it("falls back to the default on Escape", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = select({ message: "Stratégie", choices: CHOICES, default: "none" }, host);
    await press(await next(), "down", "escape");
    await expect(answer).resolves.toBe("none");
  });
});
