import { afterEach, describe, expect, it, vi } from "vitest";
import { askSharingConsent } from "../../../src/ui/prompts/consent-prompt.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { useLocale } from "../../support/locale.js";
import { createTestHost, frame, press } from "../../support/tui/test-host.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const quiet = () => vi.spyOn(process.stdout, "write").mockReturnValue(true);

describe("askSharingConsent", () => {
  useLocale("en");

  it("answers no on Escape, and says so in the scrollback", async () => {
    const write = quiet();
    const { host, next } = createTestHost();
    const answer = askSharingConsent(host);
    const screen = await next();
    expect(await frame(screen)).toContain("Share your journals?");

    await press(screen, "escape");

    await expect(answer).resolves.toBe(false);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Share your journals?"));
  });

  it("answers no on Enter: no is the highlighted button", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = askSharingConsent(host);
    await press(await next(), "enter");

    await expect(answer).resolves.toBe(false);
  });

  it("answers yes on y", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = askSharingConsent(host);
    await press(await next(), "y");

    await expect(answer).resolves.toBe(true);
  });

  it("rejects with PromptCancelledError on Ctrl+C", async () => {
    quiet();
    const { host, next } = createTestHost();
    const answer = askSharingConsent(host);
    await press(await next(), "ctrl+c");

    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError);
  });
});
