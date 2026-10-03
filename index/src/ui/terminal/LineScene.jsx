/**
 * A replayed line scene (plain CLI output). The complete scene is rendered on
 * the server and on the first client render; the replay starts afterwards.
 * Not a live region: announcing each typed line would turn a decorative
 * replay into a wall of speech — the full text is in the DOM from the start.
 */
import { useSceneReveal } from "../../lib/use-scene-reveal.js";

/** @param {{ scene: import("../../data/scenes/json-scene.js").LineScene }} props */
export function LineScene({ scene }) {
  const visible = useSceneReveal(scene.lines);
  return (
    <div className="term-lines">
      {visible.map((segments, row) => (
        <div className="term-line" key={row}>
          {segments.map((segment, column) => (
            <span key={column} className={`${segment.c ?? "t-fg"}${segment.b ? " t-bold" : ""}`}>
              {segment.t}
            </span>
          ))}
        </div>
      ))}
      <div className="term-caret" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
