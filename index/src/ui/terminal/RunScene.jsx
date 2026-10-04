/**
 * The run view as the TUI draws it (src/ui/run/): a takeover with no sidebar,
 * the status list — progress bar, done/total, the √ → × counters, the clock,
 * one row per package — over the embedded terminal pane that shows the
 * installer's own output, titled with the provider and the package. What a
 * screen reader says for the marks and the unheaded columns comes with the
 * scene, in its language (`scene.spoken`).
 *
 * @typedef {import("../../data/scenes/update-scene.js").RunScene} RunScene
 * @typedef {import("../../data/scenes/update-scene.js").RunSpoken} RunSpoken
 * @typedef {import("../../data/scenes/update-scene.js").RunStatus} RunStatus
 */
import { TUI_GLYPHS } from "../../data/scenes/tui-glyphs.js";
import { classNames } from "../../lib/class-names.js";
import { TuiBox } from "./TuiBox.jsx";
import { TuiFrame } from "./TuiFrame.jsx";
import { TuiMark } from "./TuiMark.jsx";

/** The counters after done/total, in the TUI's order. */
const COUNTERS = ["success", "skipped", "failed"];
/** Between the provider and the package in the pane's title (PANE_LABELS.title). */
const PANE_TITLE_SEPARATOR = " · ";

/** @param {{ status: RunStatus, value: number, word: string }} props */
function Counter({ status, value, word }) {
  return (
    <span className={`tui-counter tui-status--${status}`}>
      <TuiMark glyph={TUI_GLYPHS.status[status]} word={word} />
      {` ${value}`}
    </span>
  );
}

/** @param {{ progress: RunScene["progress"], statuses: RunSpoken["statuses"] }} props */
function ProgressLine({ progress, statuses }) {
  const share = `${Math.round((progress.done / progress.total) * 100)}%`;
  return (
    <p className="tui-run-head">
      <span className="tui-progress-track" aria-hidden="true">
        <span className="tui-progress-bar" style={{ "--progress": share }} />
      </span>
      <span className="tui-done">{`${progress.done}/${progress.total}`}</span>
      {COUNTERS.map((status) => (
        <Counter key={status} status={status} value={progress[status]} word={statuses[status]} />
      ))}
      <span className="tui-clock">{progress.clock}</span>
    </p>
  );
}

/**
 * @param {{ row: import("../../data/scenes/update-scene.js").RunRow,
 *   statuses: RunSpoken["statuses"] }} props
 */
function RunRow({ row, statuses }) {
  return (
    <tr className={classNames("tui-row", row.status === "running" && "is-running")}>
      <td className={`tui-mark tui-status--${row.status}`}>
        <TuiMark glyph={TUI_GLYPHS.status[row.status]} word={statuses[row.status]} />
      </td>
      <td className="tui-name">{row.name}</td>
      <td className="tui-provider">{row.provider}</td>
      <td className="tui-versions">{`${row.from} → ${row.to}`}</td>
      <td className="tui-clock">{row.clock ?? ""}</td>
    </tr>
  );
}

/** @param {{ rows: RunScene["rows"], spoken: RunSpoken }} props */
function RunTable({ rows, spoken }) {
  return (
    <table className="tui-table tui-run-table">
      <thead className="sr-only">
        <tr>
          {spoken.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <RunRow key={row.name} row={row} statuses={spoken.statuses} />
        ))}
      </tbody>
    </table>
  );
}

/** @param {{ scene: RunScene }} props */
export function RunScene({ scene }) {
  const { pane, spoken } = scene;
  return (
    <TuiFrame facts={scene.facts} hints={scene.hints} className="tui--takeover">
      <TuiBox title={scene.panelTitle} className="tui-status">
        <ProgressLine progress={scene.progress} statuses={spoken.statuses} />
        <RunTable rows={scene.rows} spoken={spoken} />
      </TuiBox>
      <TuiBox title={`${pane.provider}${PANE_TITLE_SEPARATOR}${pane.package}`} className="tui-pane">
        <pre className="tui-pane-out">{pane.lines.join("\n")}</pre>
      </TuiBox>
    </TuiFrame>
  );
}
