/**
 * The terminal demo: a tab strip over a replaying pane of real `gup` output.
 *
 * Follows the ARIA tabs pattern: arrow keys move between tabs, only the active
 * tab is in the tab order, and the output pane is the labelled `tabpanel` —
 * focusable, since it holds no focusable children of its own. It is
 * deliberately NOT a live region: the reveal types the scene out one line per
 * 95ms, and announcing each line would turn a decorative replay into a wall of
 * speech. The complete text is present in the DOM from the first render.
 */
import { useRef, useState } from "react";
import { scenes, SCENE_KEYS } from "../data/scenes.js";
import { useSceneReveal } from "../lib/hooks.jsx";

function Tabs({ active, onSelect }) {
  const refs = useRef([]);

  // Arrow keys cycle tabs, per the ARIA tabs pattern.
  const onKeyDown = (event) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const i = SCENE_KEYS.indexOf(active);
    const next = SCENE_KEYS[(i + delta + SCENE_KEYS.length) % SCENE_KEYS.length];
    onSelect(next);
    refs.current[SCENE_KEYS.indexOf(next)]?.focus();
  };

  return (
    <div className="term-tabs" role="tablist" aria-label="Exemples de sortie gup">
      {SCENE_KEYS.map((key, i) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`term-tab-${key}`}
          className="term-tab"
          aria-selected={key === active}
          aria-controls="term-panel"
          tabIndex={key === active ? 0 : -1}
          ref={(node) => {
            refs.current[i] = node;
          }}
          onClick={() => onSelect(key)}
          onKeyDown={onKeyDown}
        >
          {scenes[key].label}
        </button>
      ))}
    </div>
  );
}

function Line({ segments }) {
  return (
    <div className="term-line">
      {segments.map((s, i) => (
        <span key={i} className={`${s.c ?? "t-fg"}${s.b ? " t-bold" : ""}`}>
          {s.t}
        </span>
      ))}
    </div>
  );
}

export function Terminal({ initial = "menu" }) {
  const [key, setKey] = useState(initial);
  const scene = scenes[key];
  const { visible } = useSceneReveal(scene.lines);

  return (
    <div className="term" data-reveal="7" data-cam="1">
      <span className="term-sweep" aria-hidden="true" />
      <div className="term-head">
        <span className="term-rec-dot" aria-hidden="true" />
        <span className="term-rec">REC</span>
        <span className="term-title">~ · {scene.title}</span>
        <Tabs active={key} onSelect={setKey} />
      </div>
      <div
        className="term-body"
        id="term-panel"
        role="tabpanel"
        aria-labelledby={`term-tab-${key}`}
        tabIndex={0}
      >
        {visible.map((segments, i) => (
          <Line key={i} segments={segments} />
        ))}
        <div className="term-caret" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
