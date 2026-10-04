/**
 * The run view as the TUI draws it (src/ui/run/): a takeover with no sidebar,
 * the status list — progress bar, done/total, the ✔ ↷ ✖ counters, the clock,
 * one row per package — over the embedded terminal pane that shows the
 * installer's own output, titled with the provider and the package.
 *
 * @typedef {import("../../data/scenes/update-scene.js").RunScene} RunScene
 * @typedef {import("../../data/scenes/update-scene.js").RunStatus} RunStatus
 */
import { TUI_GLYPHS } from "../../data/scenes/tui-glyphs.js";
import { classNames } from "../../lib/class-names.js";
import { TuiBox } from "./TuiBox.jsx";
import { TuiFrame } from "./TuiFrame.jsx";
import { TuiMark } from "./TuiMark.jsx";

/** What each status mark says to a screen reader (French, like the interface's RUN_SUMMARY). */
const STATUS_WORDS = {
  success: "mis à jour",
  failed: "échec",
  skipped: "ignorée",
  cancelled: "annulée",
  pending: "en attente",
  running: "en cours",
};
/** Column headings, for screen readers only: the run view draws none. */
const COLUMNS = ["État", "Paquet", "Provider", "Versions", "Durée"];
/** Between the provider and the package in the pane's title (PANE_LABELS.title). */
const PANE_TITLE_SEPARATOR = " · ";

/** @param {{ status: RunStatus, value: number }} props */
function Counter({ status, value }) {
  return (
    <span className={`tui-counter tui-status--${status}`}>
      <TuiMark glyph={TUI_GLYPHS.status[status]} word={STATUS_WORDS[status]} />
      {` ${value}`}
    </span>
  );
}

/** @param {{ progress: RunScene["progress"] }} props */
function ProgressLine({ progress }) {
  const share = `${Math.round((progress.done / progress.total) * 100)}%`;
  return (
    <p className="tui-run-head">
      <span className="tui-progress-track" aria-hidden="true">
        <span className="tui-progress-bar" style={{ "--progress": share }} />
      </span>
      <span className="tui-done">{`${progress.done}/${progress.total}`}</span>
      <Counter status="success" value={progress.success} />
      <Counter status="skipped" value={progress.skipped} />
      <Counter status="failed" value={progress.failed} />
      <span className="tui-clock">{progress.clock}</span>
    </p>
  );
}

/** @param {{ row: import("../../data/scenes/update-scene.js").RunRow }} props */
function RunRow({ row }) {
  return (
    <tr className={classNames("tui-row", row.status === "running" && "is-running")}>
      <td className={`tui-mark tui-status--${row.status}`}>
        <TuiMark glyph={TUI_GLYPHS.status[row.status]} word={STATUS_WORDS[row.status]} />
      </td>
      <td className="tui-name">{row.name}</td>
      <td className="tui-provider">{row.provider}</td>
      <td className="tui-versions">{`${row.from} → ${row.to}`}</td>
      <td className="tui-clock">{row.clock ?? ""}</td>
    </tr>
  );
}

/** @param {{ rows: RunScene["rows"] }} props */
function RunTable({ rows }) {
  return (
    <table className="tui-table tui-run-table">
      <thead className="sr-only">
        <tr>
          {COLUMNS.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <RunRow key={row.name} row={row} />
        ))}
      </tbody>
    </table>
  );
}

/** @param {{ scene: RunScene }} props */
export function RunScene({ scene }) {
  const { pane } = scene;
  return (
    <TuiFrame facts={scene.facts} hints={scene.hints} className="tui--takeover">
      <TuiBox title={scene.panelTitle} className="tui-status">
        <ProgressLine progress={scene.progress} />
        <RunTable rows={scene.rows} />
      </TuiBox>
      <TuiBox title={`${pane.provider}${PANE_TITLE_SEPARATOR}${pane.package}`} className="tui-pane">
        <pre className="tui-pane-out">{pane.lines.join("\n")}</pre>
      </TuiBox>
    </TuiFrame>
  );
}
