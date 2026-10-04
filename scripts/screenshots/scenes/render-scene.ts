import type { CapturedFrame } from "@opentui/core";
import { DOCS_PALETTE } from "../render/docs-palette.js";
import { toFrameModel } from "../render/frame-model.js";
import { renderSvg } from "../render/svg-frame.js";
import { machinePathsIn } from "../sandbox/machine-paths.js";
import { captureScene } from "./capture-scene.js";
import type { Scene } from "./scene.js";

/**
 * The SVG screenshot of `scene`, as a terminal with the docs palette shows
 * it. Refused when the frame shows a path of the machine rendering it.
 */
export async function renderScene(scene: Scene): Promise<string> {
  const frame = await captureScene(scene);
  const leaked = machinePathsIn(textOf(frame));
  if (leaked.length > 0) {
    throw new Error(`${scene.id} shows a path of the machine rendering it: ${leaked.join(", ")}`);
  }
  return renderSvg(toFrameModel(frame, DOCS_PALETTE), {
    title: scene.title,
    description: scene.alt,
    palette: DOCS_PALETTE,
  });
}

function textOf(frame: CapturedFrame): string {
  return frame.lines.map((line) => line.spans.map((span) => span.text).join("")).join("\n");
}
