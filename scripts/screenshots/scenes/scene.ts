import type { AppFixture } from "../fixtures/app-fixture.js";

/** A terminal size, in cells. */
export interface SceneSize {
  readonly cols: number;
  readonly rows: number;
}

/** What a scene can do to bring the mounted app to the state it captures. */
export interface Stage {
  /** Keys as the TUI test host names them (`down`, `space`, `tab`, `enter`…) or characters. */
  press(...keys: string[]): Promise<void>;
  /** Resolves once `text` is on screen; throws with the frame dumped otherwise. */
  waitForText(text: string): Promise<void>;
}

/** A scene id is a file stem: kebab-case, so it is always a safe file name. */
export const SCENE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One screenshot: the app on fixture data, driven by keys to the state to capture. */
export interface Scene {
  /** `docs/assets/screens/<id>.svg`; unique, matches {@link SCENE_ID}. */
  readonly id: string;
  /** Window title: "gup — <view label as the app shows it>". */
  readonly title: string;
  /** English alt text, at most 250 characters: what the screen shows. */
  readonly alt: string;
  readonly size: SceneSize;
  fixture(): AppFixture;
  /** Drive the mounted app to the state to capture; ends on a `waitForText`. */
  play(stage: Stage): Promise<void>;
}
