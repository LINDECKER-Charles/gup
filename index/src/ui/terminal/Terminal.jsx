/**
 * The hero's terminal demo: a window frame, the scene tabs, the active scene
 * and a visible caption. The frame is always left-to-right (tab order and
 * arrow keys never invert) and the panel takes the scene's language (`fr` for
 * the TUI mocks), so assistive tech reads the French interface in French on
 * every locale. The window label and the caption are the page's own prose
 * and keep its direction.
 */
import { useState } from "react";
import { SCENES } from "../../data/scenes/index.js";
import { useI18n } from "../../i18n/use-i18n.js";
import { LineScene } from "./LineScene.jsx";
import { PackagesScene } from "./PackagesScene.jsx";
import { RunScene } from "./RunScene.jsx";
import { TerminalTabs } from "./TerminalTabs.jsx";

/** The component that draws each kind of scene. */
const SCENE_VIEWS = { packages: PackagesScene, run: RunScene, lines: LineScene };

function TerminalHead({ terminal, dir, active, onSelect }) {
  return (
    <div className="term-head" dir="ltr">
      <span className="term-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="term-label" id="term-label" dir={dir}>
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
  const { locale, messages } = useI18n();
  const { terminal } = messages.hero;
  const [active, setActive] = useState(SCENES[0].id);
  const { scene } = SCENES.find((entry) => entry.id === active);
  const SceneView = SCENE_VIEWS[scene.kind];

  return (
    <figure className="term" aria-labelledby="term-label">
      <TerminalHead
        terminal={terminal}
        dir={locale.dir}
        active={active}
        onSelect={setActive}
      />
      <div
        className="term-panel"
        id="term-panel"
        role="tabpanel"
        aria-labelledby={`term-tab-${active}`}
        tabIndex={0}
        dir="ltr"
        lang={scene.lang}
      >
        <SceneView scene={scene} />
      </div>
      <figcaption className="term-caption" dir={locale.dir}>
        {terminal.caption}
      </figcaption>
    </figure>
  );
}
