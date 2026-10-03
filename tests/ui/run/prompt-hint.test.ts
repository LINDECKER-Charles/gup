import { describe, expect, it } from "vitest";
import { isLikelyAwaitingInput, PROMPT_IDLE_MS } from "../../../src/ui/run/prompt-hint.js";

const silent = (lastLine: string) => ({ lastLine, idleMs: PROMPT_IDLE_MS });

describe("isLikelyAwaitingInput", () => {
  it.each(["Password:", "Mot de passe : ", "Continuer ? ", "Proceed [Y/n]", "Supprimer (o/n)", "PS C:\\> "])(
    "reads %j after a silence as a question",
    (line) => {
      expect(isLikelyAwaitingInput(silent(line))).toBe(true);
    },
  );

  it("ignores a progress line, an empty line, and a prompt that is still talking", () => {
    expect(isLikelyAwaitingInput(silent("  ██████▌   48.2 MB / 98.0 MB"))).toBe(false);
    expect(isLikelyAwaitingInput(silent(""))).toBe(false);
    expect(isLikelyAwaitingInput({ lastLine: "Password:", idleMs: PROMPT_IDLE_MS - 1 })).toBe(false);
  });
});
