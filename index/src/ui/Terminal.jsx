// Animated terminal — renders one scene from data/scenes.js.
import { useState } from "react";
import { Play } from "../lib/icons.jsx";
import { useTerminalAnimation } from "../lib/hooks.jsx";
import { scenes } from "../data/scenes.js";

function TerminalTabs({ scenes, activeKey, onSelect }) {
  return (
    <div className="tabs">
      {Object.entries(scenes).map(([key, s]) => (
        <button
          key={key}
          className={`tab ${activeKey === key ? "active" : ""}`}
          onClick={() => onSelect(key)}
        >
          {s.tab}
        </button>
      ))}
    </div>
  );
}

function TerminalLine({ line }) {
  const cls = `term-line ${line.c || ""}`.trim();
  if (line.segs) {
    return (
      <div className={cls}>
        {line.segs.map((s, j) => (
          <span key={j} className={s.c || ""}>{s.t}</span>
        ))}
      </div>
    );
  }
  return <div className={cls}>{line.t || " "}</div>;
}

function ReplayBar({ onReplay }) {
  return (
    <div className="term-footer">
      <button className="term-replay" onClick={onReplay}>
        <Play size={10} /> rejouer
      </button>
      <span className="term-c-dim term-hint">ou choisis un autre mode ↗</span>
    </div>
  );
}

export function Terminal({ initialScene = "menu" }) {
  const [sceneKey, setSceneKey] = useState(initialScene);
  const current = scenes[sceneKey];
  const { lines, isLastFrame, replay } = useTerminalAnimation(current.frames);

  return (
    <div className="term">
      <div className="term-head">
        <div className="dots"><span /><span /><span /></div>
        <span className="title">~ · {current.title}</span>
        <TerminalTabs scenes={scenes} activeKey={sceneKey} onSelect={setSceneKey} />
      </div>
      <div className="term-body term-bg-pattern">
        {lines.map((ln, i) => <TerminalLine key={i} line={ln} />)}
        {isLastFrame && <ReplayBar onReplay={replay} />}
      </div>
    </div>
  );
}
