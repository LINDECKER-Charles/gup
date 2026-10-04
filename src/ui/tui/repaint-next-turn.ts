import type { CliRenderer } from "@opentui/core";

/** The part of the renderer a repaint needs. */
type Repaintable = Pick<CliRenderer, "isDestroyed" | "requestRender">;

/**
 * Ask for a frame on the next turn of the event loop. Code that changes the
 * screen from a promise continuation (a dialog answered, a detection that
 * came back) can run right after a frame was drawn but before OpenTUI 0.5.14
 * marked it finished: the frame request it makes is then dropped, and an idle
 * screen — no scan, no run view ticking — would show the change only at the
 * next key press. A second request, one turn later, always lands.
 */
export function repaintNextTurn(renderer: Repaintable): void {
  setImmediate(() => {
    if (!renderer.isDestroyed) renderer.requestRender();
  });
}
