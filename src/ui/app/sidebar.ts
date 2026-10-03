import { fillLine, fit, seg, type Line } from "../tui/styled-lines.js";

export type ViewId = "scan" | "packages" | "providers" | "options";
export type ActionId = "update-all" | "target" | "quit";
export type NavId = ViewId | ActionId;

export interface NavEntry {
  readonly id: NavId;
  readonly label: string;
  /** Views open in the main area; actions run (or ask) when chosen. */
  readonly isAction: boolean;
}

export const NAV: readonly NavEntry[] = [
  { id: "scan", label: "Scan", isAction: false },
  { id: "packages", label: "Paquets", isAction: false },
  { id: "update-all", label: "Tout mettre à jour", isAction: true },
  { id: "target", label: "Cible…", isAction: true },
  { id: "providers", label: "Providers", isAction: false },
  { id: "options", label: "Options", isAction: false },
  { id: "quit", label: "Quitter", isAction: true },
];

/** Entries preceded by a blank row: views, actions and the exit read as groups. */
const STARTS_GROUP = new Set<NavId>(["update-all", "providers", "quit"]);

/** Outer width of the sidebar box, border included. */
export const SIDEBAR_WIDTH = 26;
const LABEL_WIDTH = 18;

export interface SidebarState {
  /** The view on screen in the main area. */
  readonly current: ViewId;
  /** The entry under the cursor while the sidebar has the focus. */
  readonly cursor: number;
  readonly isFocused: boolean;
  /** Small counts shown after a label, by entry. */
  readonly badges: Partial<Record<NavId, string>>;
}

/** Index of the content row a click landed on → nav entry, ignoring the blank separators. */
export function entryAtRow(row: number): number | null {
  const index = rowIndexes().indexOf(row);
  return index === -1 ? null : index;
}

export function renderSidebar(state: SidebarState, width: number): Line[] {
  const lines: Line[] = [];
  NAV.forEach((entry, index) => {
    if (STARTS_GROUP.has(entry.id)) lines.push([]);
    lines.push(entryLine(index, state, width));
  });
  return lines;
}

function entryLine(index: number, state: SidebarState, width: number): Line {
  const entry = NAV[index] as NavEntry;
  const isCurrent = entry.id === state.current;
  const isUnderCursor = state.isFocused && index === state.cursor;
  const badge = state.badges[entry.id] ?? "";
  const line: Line = [
    seg(isCurrent ? "▌ " : isUnderCursor ? "› " : "  ", "accent"),
    seg(fit(entry.label, LABEL_WIDTH), isCurrent ? "strong" : entry.isAction ? "muted" : "plain"),
    seg(badge, "warning"),
  ];
  return isUnderCursor || (isCurrent && !state.isFocused)
    ? fillLine(line, width, "highlight")
    : line;
}

/** Content row of each nav entry, accounting for the blank separator rows. */
function rowIndexes(): number[] {
  let row = 0;
  return NAV.map((entry) => {
    if (STARTS_GROUP.has(entry.id)) row++;
    return row++;
  });
}
