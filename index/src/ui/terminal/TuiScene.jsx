/**
 * A static mock of the full-screen TUI built from structured HTML — sidebar
 * list, package table, embedded terminal pane, key hints — rather than
 * box-drawing character art, so it reflows, scales and never misaligns when a
 * glyph falls back to another font.
 *
 * Its text is French (the real interface), hence the French state words read
 * by screen readers next to each glyph.
 *
 * @typedef {import("../../data/scenes/app-scene.js").TuiScene} TuiScene
 * @typedef {import("../../data/scenes/app-scene.js").TuiRow} TuiRow
 */

const STATES = {
  checked: { glyph: "[x]", word: "coché" },
  unchecked: { glyph: "[ ]", word: "non coché" },
  running: { glyph: "◐", word: "en cours" },
  done: { glyph: "✔", word: "terminé" },
  queued: { glyph: "·", word: "en attente" },
  failed: { glyph: "✖", word: "échec" },
};

const classes = (...names) => names.filter(Boolean).join(" ") || undefined;

/** @param {{ row: TuiRow }} props */
function Row({ row }) {
  if (row.kind === "group") {
    return (
      <tr className="tui-group">
        <td colSpan={3}>
          <span aria-hidden="true">▾ </span>
          {row.provider}
        </td>
        <td className="tui-count">{row.count}</td>
      </tr>
    );
  }
  const state = STATES[row.state];
  return (
    <tr className={classes("tui-row", `tui-row--${row.state}`, row.isCursor && "is-cursor")}>
      <td className="tui-mark">
        <span aria-hidden="true">{state.glyph}</span>
        <span className="sr-only">{state.word}</span>
      </td>
      <td className="tui-name">{row.name}</td>
      <td className="tui-from">{row.from}</td>
      <td className="tui-to">→ {row.to}</td>
    </tr>
  );
}

/** @param {{ items: TuiScene["sidebar"] }} props */
function Sidebar({ items }) {
  return (
    <ul className="tui-side">
      {items.map((item) => (
        <li
          key={item.label}
          className={classes(item.isCurrent && "is-current", item.startsGroup && "starts-group")}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="tui-badge">{item.badge}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** @param {{ pane: NonNullable<TuiScene["pane"]> }} props */
function Pane({ pane }) {
  return (
    <div className="tui-pane">
      <p className="tui-pane-title">{pane.title}</p>
      <pre className="tui-pane-out">{pane.lines.join("\n")}</pre>
      {pane.progress === undefined ? null : (
        <p className="tui-progress">
          <span className="tui-progress-track">
            <span className="tui-progress-bar" style={{ "--progress": `${pane.progress}%` }} />
          </span>
          <span>{pane.progress}%</span>
        </p>
      )}
    </div>
  );
}

/** @param {{ scene: TuiScene }} props */
export function TuiScene({ scene }) {
  return (
    <div className={classes("tui", !scene.sidebar && "tui--takeover")}>
      <p className="tui-top">{scene.topBar}</p>
      <div className="tui-body">
        {scene.sidebar ? <Sidebar items={scene.sidebar} /> : null}
        <div className="tui-main">
          <p className="tui-title">{scene.panelTitle}</p>
          <table className="tui-table">
            <tbody>
              {scene.rows.map((row) => (
                <Row key={row.kind === "group" ? `g-${row.provider}` : row.name} row={row} />
              ))}
            </tbody>
          </table>
          {scene.pane ? <Pane pane={scene.pane} /> : null}
        </div>
      </div>
      <p className="tui-hints">{scene.hints}</p>
    </div>
  );
}
