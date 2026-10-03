/**
 * ARIA tabs over the terminal scenes: ←/→ cycle, Home/End jump to the ends,
 * only the active tab is in the tab order. The strip sits inside the
 * terminal's `dir="ltr"` frame, so the arrows never invert in RTL pages.
 */
import { useRef } from "react";
import { SCENES } from "../../data/scenes/index.js";

const IDS = SCENES.map((entry) => entry.id);

function nextIndex(key, current) {
  const last = IDS.length - 1;
  const moves = {
    ArrowRight: current === last ? 0 : current + 1,
    ArrowLeft: current === 0 ? last : current - 1,
    Home: 0,
    End: last,
  };
  return moves[key];
}

function Tab({ id, label, isActive, onSelect, onKeyDown, register }) {
  return (
    <button
      type="button"
      role="tab"
      id={`term-tab-${id}`}
      className="term-tab"
      aria-selected={isActive}
      aria-controls="term-panel"
      tabIndex={isActive ? 0 : -1}
      ref={register}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
    >
      {label}
    </button>
  );
}

/**
 * @param {{ active: string, onSelect: (id: string) => void,
 *   labels: Record<string, string>, name: string }} props
 */
export function TerminalTabs({ active, onSelect, labels, name }) {
  const buttons = useRef([]);

  const onKeyDown = (event) => {
    const index = nextIndex(event.key, IDS.indexOf(active));
    if (index === undefined) return;
    event.preventDefault();
    onSelect(IDS[index]);
    buttons.current[index]?.focus();
  };

  return (
    <div className="term-tabs" role="tablist" aria-label={name}>
      {IDS.map((id, index) => (
        <Tab
          key={id}
          id={id}
          label={labels[id]}
          isActive={id === active}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          register={(node) => {
            buttons.current[index] = node;
          }}
        />
      ))}
    </div>
  );
}
