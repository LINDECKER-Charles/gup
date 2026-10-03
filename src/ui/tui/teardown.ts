import type { CliRenderer } from "@opentui/core";

/** How long to wait for a teardown OpenTUI deferred to the end of a frame. */
const DEFERRED_DESTROY_TIMEOUT_MS = 1000;

/**
 * Destroy the renderer, leaving the alternate screen *before* stdin goes back
 * to line mode.
 *
 * OpenTUI does it the other way round: it calls `stdin.setRawMode(false)`
 * first, then its native side leaves the alternate screen. On the Windows
 * console host shipped with Windows 11 24H2 (conhost 10.0.26100), that order
 * crashes conhost with an access violation on the very next write — as soon
 * as a key has been read during the session. The console window dies and
 * takes gup, the shell and any running installer with it. Reproduced without
 * OpenTUI: `ESC[?1049h`, read a key in raw mode, leave raw mode, `ESC[?1049l`,
 * write a line. Leaving the alternate screen while still in raw mode does not
 * crash, so raw mode is held until the renderer is completely gone.
 *
 * When `destroy()` lands mid-frame, OpenTUI finishes the teardown at the end
 * of that frame; the `destroy` event marks the final phase, after which the
 * rest of it runs synchronously.
 */
export async function destroyRenderer(
  renderer: CliRenderer,
  stdin: NodeJS.ReadStream = process.stdin,
): Promise<void> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    renderer.destroy();
    return;
  }
  const restore = holdRawMode(stdin);
  try {
    const finished = new Promise<void>((resolve) => {
      renderer.once("destroy", () => resolve());
      setTimeout(resolve, DEFERRED_DESTROY_TIMEOUT_MS).unref();
    });
    renderer.destroy();
    await finished;
  } finally {
    restore();
  }
}

/**
 * Ignore requests to leave raw mode until the returned function is called,
 * which restores `setRawMode` and leaves raw mode for real.
 */
function holdRawMode(stdin: NodeJS.ReadStream): () => void {
  const hadOwn = Object.prototype.hasOwnProperty.call(stdin, "setRawMode");
  const original = stdin.setRawMode;
  stdin.setRawMode = function (this: NodeJS.ReadStream, mode: boolean) {
    return mode ? original.call(this, mode) : this;
  } as typeof stdin.setRawMode;
  return () => {
    if (hadOwn) stdin.setRawMode = original;
    else delete (stdin as { setRawMode?: unknown }).setRawMode;
    stdin.setRawMode(false);
  };
}
