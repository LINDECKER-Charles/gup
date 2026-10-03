import { afterEach, describe, expect, it, vi } from "vitest";
import { select, type SelectEntry } from "../../../src/ui/prompts/select.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { createTestHost, frame, press } from "../tui-test-host.js";

const MENU: SelectEntry<string>[] = [
  { label: "Scan", hint: "rescanne", value: "scan" },
  { label: "Review", value: "review", disabled: "aucune mise à jour" },
  { separator: true },
  { label: "Options", hint: "fast mode", value: "options", description: "Réglages du scan." },
  { label: "Quit", value: "quit" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("select", () => {
  it("resolves the highlighted choice, skipping disabled entries and separators", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    const answer = select({ message: "Action", choices: MENU }, host);
    const screen = await next();

    await press(screen, "down", "enter");

    await expect(answer).resolves.toBe("options");
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Action"));
  });

  it("stops at the end of the list instead of wrapping", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    const answer = select({ message: "Action", choices: MENU }, host);
    const screen = await next();

    await press(screen, "down", "down", "down", "down", "enter");

    await expect(answer).resolves.toBe("quit");
  });

  it("opens on the default choice", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { host, next } = createTestHost();
    const answer = select({ message: "Action", choices: MENU, default: "quit" }, host);

    await press(await next(), "enter");

    await expect(answer).resolves.toBe("quit");
  });

  it("shows hints, disabled reasons and the active choice's description", async () => {
    const { host, next } = createTestHost();
    void select({ message: "Action", choices: MENU, default: "options" }, host).catch(() => {});
    const screen = await next();

    const text = await frame(screen);

    expect(text).toContain("◆  Action");
    expect(text).toContain("rescanne");
    expect(text).toContain("aucune mise à jour");
    expect(text).toContain("Réglages du scan.");
    await press(screen, "ctrl+c");
  });

  it("rejects with PromptCancelledError on Ctrl+C", async () => {
    const { host, next } = createTestHost();
    const answer = select({ message: "Action", choices: MENU }, host);

    await press(await next(), "ctrl+c");

    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
  });
});
