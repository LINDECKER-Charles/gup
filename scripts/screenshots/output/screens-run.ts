import { rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { renderScene } from "../scenes/render-scene.js";
import { SCENE_ID, type Scene } from "../scenes/scene.js";
import { findOrphans } from "./find-orphans.js";
import { renderGallery } from "./render-gallery.js";
import { syncFile, type SyncMode, type SyncResult } from "./sync-file.js";

const GALLERY = "README.md";
const REGENERATE = "run `npm run screenshots` and commit the result.";
/** What a check-mode status means for the committed file; absent: nothing to fix. */
const DRIFT: Partial<Record<SyncResult["status"], string>> = {
  stale: "is out of date",
  missing: "is missing",
};

/** A path as a developer types it from the repository root. */
function shown(path: string): string {
  return relative(process.cwd(), path).split(sep).join("/");
}

/**
 * One pass of the generator over a screenshots directory. Write mode brings
 * every file up to date and deletes the SVGs no scene produces any more;
 * check mode writes nothing and fails on the first file that differs, naming
 * it and the command that fixes it.
 */
export class ScreensRun {
  readonly #dir: string;
  readonly #mode: SyncMode;

  constructor(dir: string, mode: SyncMode) {
    this.#dir = dir;
    this.#mode = mode;
  }

  /** Render `scene` and sync `<id>.svg`. */
  async scene(scene: Scene): Promise<SyncResult> {
    if (!SCENE_ID.test(scene.id)) throw new Error(`not a scene id: ${JSON.stringify(scene.id)}`);
    const svg = await renderScene(scene);
    return this.verified(await syncFile(join(this.#dir, `${scene.id}.svg`), svg, this.#mode));
  }

  /** Sync the gallery page listing `scenes`. */
  async gallery(scenes: readonly Scene[]): Promise<SyncResult> {
    const page = renderGallery(scenes);
    return this.verified(await syncFile(join(this.#dir, GALLERY), page, this.#mode));
  }

  /** The SVGs no scene produces: deleted in write mode, a failure in check mode. */
  async orphans(scenes: readonly Scene[]): Promise<readonly string[]> {
    const orphans = await findOrphans(this.#dir, scenes.map((scene) => scene.id));
    if (this.#mode === "check" && orphans.length > 0) {
      const list = orphans.map(shown).join(", ");
      throw new Error(`${list} no longer match any scene — ${REGENERATE}`);
    }
    await Promise.all(orphans.map((orphan) => rm(orphan)));
    return orphans;
  }

  /** `result`, unless check mode found the file different or absent. */
  private verified(result: SyncResult): SyncResult {
    const problem = DRIFT[result.status];
    if (problem) throw new Error(`${shown(result.path)} ${problem} — ${REGENERATE}`);
    return result;
  }
}
