import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { CliRenderer } from "@opentui/core";
import { destroyRenderer } from "../../../src/ui/tui/teardown.js";

/**
 * A stand-in for OpenTUI's teardown order: leave raw mode first, then leave
 * the alternate screen — immediately, or at the end of the frame in progress.
 * The order is the whole point: the other way round crashes Windows conhost.
 */
function fakes(isMidFrame: boolean) {
  const steps: string[] = [];
  const stdin = {
    isTTY: true,
    setRawMode(mode: boolean) {
      steps.push(`raw ${mode}`);
      return stdin;
    },
  };
  const renderer = new EventEmitter() as EventEmitter & { destroy(): void };
  const finish = (): void => {
    renderer.emit("destroy");
    steps.push("leave alternate screen");
  };
  renderer.destroy = () => {
    stdin.setRawMode(false);
    if (isMidFrame) setTimeout(finish, 5);
    else finish();
  };
  return { steps, stdin, renderer: renderer as unknown as CliRenderer };
}

describe("destroyRenderer", () => {
  it.each([
    ["a destroy outside a frame", false],
    ["a destroy deferred to the end of a frame", true],
  ])("leaves the alternate screen before raw mode, for %s", async (_, isMidFrame) => {
    const { steps, stdin, renderer } = fakes(isMidFrame);
    const real = stdin.setRawMode;
    await destroyRenderer(renderer, stdin as unknown as NodeJS.ReadStream);
    expect(steps).toEqual(["leave alternate screen", "raw false"]);
    expect(stdin.setRawMode).toBe(real);
  });
});
