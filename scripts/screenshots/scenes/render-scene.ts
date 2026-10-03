import { DOCS_PALETTE } from "../render/docs-palette.js";
import { toFrameModel } from "../render/frame-model.js";
import { renderSvg } from "../render/svg-frame.js";
import { captureScene } from "./capture-scene.js";
import type { Scene } from "./scene.js";

/** The SVG screenshot of `scene`, as a terminal with the docs palette shows it. */
export async function renderScene(scene: Scene): Promise<string> {
  const frame = await captureScene(scene);
  return renderSvg(toFrameModel(frame, DOCS_PALETTE), {
    title: scene.title,
    description: scene.alt,
    palette: DOCS_PALETTE,
  });
}
