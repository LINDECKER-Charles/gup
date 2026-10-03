import type { SceneSize } from "./scene.js";

/** Terminal sizes scenes are rendered at. */
export const SCENE_SIZES = {
  /** 100 × 28 cells: 812 × 526 px, the width of GitHub's README column. */
  default: { cols: 100, rows: 28 },
} as const satisfies Record<string, SceneSize>;
