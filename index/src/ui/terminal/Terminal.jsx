/**
 * The hero's terminal demo: a window frame, the scene tabs, the active scene
 * and a visible caption. The panel is always `dir="ltr"` and takes the
 * scene's language (`fr` for the TUI mocks), so assistive tech reads the
 * French interface in French on every locale.
 */
import { useState } from "react";
import { SCENES } from "../../data/scenes/index.js";
import { useI18n } from "../../i18n/use-i18n.js";
import { LineScene } from "./LineScene.jsx";
import { TerminalTabs } from "./TerminalTabs.jsx";
import { TuiScene } from "./TuiScene.jsx";

function TerminalHead({ terminal, active, onSelect }) {
  return (
    <div className="term-head" dir="ltr">
      <span className="term-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="term-label" id="term-label">
        {terminal.label}
      </span>
      <TerminalTabs
        active={active}
        onSelect={onSelect}
        labels={terminal.tabs}
        name={terminal.label}
      />
    </div>
  );
}

export function Terminal() {
  const { terminal } = useI18n().messages.hero;
  const [active, setActive] = useState(SCENES[0].id);
  const { scene } = SCENES.find((entry) => entry.id === active);

  return (
    <figure className="term" aria-labelledby="term-label">
      <TerminalHead terminal={terminal} active={active} onSelect={setActive} />
      <div
        className="term-panel"
        id="term-panel"
        role="tabpanel"
        aria-labelledby={`term-tab-${active}`}
        tabIndex={0}
        dir="ltr"
        lang={scene.lang}
      >
        {scene.kind === "tui" ? <TuiScene scene={scene} /> : <LineScene scene={scene} />}
      </div>
      <figcaption className="term-caption">{terminal.caption}</figcaption>
    </figure>
  );
}
