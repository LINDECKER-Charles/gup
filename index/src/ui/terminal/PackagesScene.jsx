/**
 * Paquets as the TUI draws it (src/ui/panels/packages-panel.ts): the sidebar,
 * then the package table grouped by provider — a box per provider for all,
 * some or none of its packages, a box per package, the `◷` of a scheduled
 * one — and the selection bar with its launch button.
 *
 * @typedef {import("../../data/scenes/app-scene.js").PackagesScene} PackagesScene
 * @typedef {import("../../data/scenes/sample-machine.js").SampleGroup} SampleGroup
 * @typedef {import("../../data/scenes/sample-machine.js").SamplePackage} SamplePackage
 */
import { TUI_GLYPHS } from "../../data/scenes/tui-glyphs.js";
import { classNames } from "../../lib/class-names.js";
import { TuiBox } from "./TuiBox.jsx";
import { TuiFrame } from "./TuiFrame.jsx";
import { TuiMark } from "./TuiMark.jsx";

/** What each box says to a screen reader (French, like the interface). */
const BOX_WORDS = { checked: "coché", partial: "en partie coché", unchecked: "non coché" };
const SCHEDULED_WORD = "planifié";
/** Heading of the box column, for screen readers only: the TUI leaves it blank. */
const BOX_COLUMN = "Sélection";

function boxOf(checked, total) {
  if (checked === 0) return "unchecked";
  return checked === total ? "checked" : "partial";
}

/** @param {import("../../data/scenes/app-scene.js").TuiSidebarItem} item */
const sidebarClass = (item) =>
  classNames(item.isCurrent && "is-current", item.startsGroup && "starts-group");

/** @param {{ title: string, items: PackagesScene["sidebar"] }} props */
function Sidebar({ title, items }) {
  return (
    <TuiBox title={title} className="tui-side">
      <ul>
        {items.map((item) => (
          <li key={item.label} className={sidebarClass(item)}>
            <span className="tui-gutter" aria-hidden="true">
              {item.isCurrent ? TUI_GLYPHS.current : ""}
            </span>
            <span className="tui-label">{item.label}</span>
            {item.badge ? <span className="tui-badge">{item.badge}</span> : null}
          </li>
        ))}
      </ul>
    </TuiBox>
  );
}

/** @param {{ group: SampleGroup }} props */
function GroupRow({ group }) {
  const total = group.packages.length;
  const checked = group.packages.filter((pkg) => pkg.isChecked).length;
  const box = boxOf(checked, total);
  return (
    <tr className={classNames("tui-group", checked > 0 && "is-checked")}>
      <td className="tui-mark">
        <span className="tui-gutter" aria-hidden="true" />
        <TuiMark glyph={TUI_GLYPHS.box[box]} word={BOX_WORDS[box]} className="tui-box-mark" />
      </td>
      <td colSpan={3}>
        {group.provider}
        <span className="tui-count">{`${checked}/${total}`}</span>
      </td>
    </tr>
  );
}

/** @param {{ pkg: SamplePackage, isCursor: boolean }} props */
function PackageRow({ pkg, isCursor }) {
  const box = pkg.isChecked ? "checked" : "unchecked";
  return (
    <tr className={classNames("tui-row", pkg.isChecked && "is-checked", isCursor && "is-cursor")}>
      <td className="tui-mark">
        <span className="tui-gutter" aria-hidden="true">
          {isCursor ? TUI_GLYPHS.cursor : ""}
        </span>
        <TuiMark glyph={TUI_GLYPHS.box[box]} word={BOX_WORDS[box]} className="tui-box-mark" />
        {pkg.isScheduled ? (
          <TuiMark
            glyph={TUI_GLYPHS.status.scheduled}
            word={SCHEDULED_WORD}
            className="tui-flag"
          />
        ) : null}
      </td>
      <td className="tui-name">{pkg.name}</td>
      <td className="tui-from">{pkg.from}</td>
      <td className="tui-to">
        <span className="tui-arrow">→ </span>
        {pkg.to}
      </td>
    </tr>
  );
}

/** @param {{ scene: PackagesScene }} props */
function PackageTable({ scene }) {
  const { columns, groups, cursor } = scene;
  return (
    <table className="tui-table">
      <thead>
        <tr>
          <th scope="col" className="tui-mark">
            <span className="sr-only">{BOX_COLUMN}</span>
          </th>
          <th scope="col">{columns.name}</th>
          <th scope="col" className="tui-from">
            {columns.current}
          </th>
          <th scope="col">{columns.latest}</th>
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.provider}>
          <GroupRow group={group} />
          {group.packages.map((pkg) => (
            <PackageRow key={pkg.name} pkg={pkg} isCursor={pkg.name === cursor} />
          ))}
        </tbody>
      ))}
    </table>
  );
}

/** @param {{ scene: PackagesScene }} props */
export function PackagesScene({ scene }) {
  return (
    <TuiFrame facts={scene.facts} hints={scene.hints}>
      <Sidebar title={scene.sidebarTitle} items={scene.sidebar} />
      <TuiBox title={scene.panelTitle} isFocused className="tui-main">
        <PackageTable scene={scene} />
        <p className="tui-bar">
          <span className="tui-bar-count">{scene.selection.count}</span>
          <span className="tui-button">{scene.selection.button}</span>
        </p>
      </TuiBox>
    </TuiFrame>
  );
}
