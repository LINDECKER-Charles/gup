import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALES } from "../../../src/core/i18n/locale.js";
import { confirm } from "../../../src/ui/prompts/confirm.js";
import { select } from "../../../src/ui/prompts/select.js";
import { DIALOG_HINTS } from "../../../src/ui/text/menu-labels.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { useLocale } from "../../support/locale.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

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

  it("names its keys on the hint bar", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continuer ?" }, host);
    const screen = await next();
    expect((await frame(screen)).trimEnd().split("\n").at(-1)?.trim()).toBe(DIALOG_HINTS.confirm);
    await press(screen, "o");
    await answer;
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

describe("confirm in English", () => {
  useLocale("en");

  it("names its buttons and keys in English, and leaves the answer in English", async () => {
    const write = quiet();
    const { host, next } = createTestHost();
    const answer = confirm({ message: "Continue?", default: false }, host);
    const screen = await next();
    const shown = await frame(screen);
    expect(shown).toContain(" Yes ");
    expect(shown).toContain(" No ");
    expect(shown.trimEnd().split("\n").at(-1)?.trim()).toBe(
      "←→ choose · y yes · n no · enter confirm · esc cancel",
    );
    await press(screen, "y");
    await expect(answer).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Continue? "));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("· yes"));
  });
});

/** The answer keys do not depend on the language: `y` (yes) or `o` (oui), `n` (no, non). */
describe.each(LOCALES)("confirm's keys in %s", (locale) => {
  useLocale(locale);

  it.each(["y", "o"])("answers yes to %s", async (key) => {
    quiet();
    const { host, next } = createTestHost();
    const answer = confirm({ message: "?", default: false }, host);
    await press(await next(), key);
    await expect(answer).resolves.toBe(true);
  });

  it("answers no to n", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = confirm({ message: "?" }, host);
    await press(await next(), "n");
    await expect(answer).resolves.toBe(false);
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
