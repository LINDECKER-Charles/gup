import { MENU_LABELS } from "../text/menu-labels.js";
import type { Density } from "../theme/appearance.js";
import { fillLine, fit, seg, type Line, type Tone } from "../tui/styled-lines.js";
import type { SidebarBadge, ViewDefinition, ViewId } from "./view-definition.js";

/** "Quit": the one entry that is not a view, always last. */
export const QUIT = "quit";

export interface SidebarEntry {
  readonly id: ViewId | typeof QUIT;
  readonly label: string;
  /** Entries of a group read together; a blank row separates groups (comfortable density). */
  readonly group: number;
  readonly badge?: SidebarBadge | null;
}

/** What the sidebar lists, and how tightly. */
export interface SidebarLayout {
  readonly entries: readonly SidebarEntry[];
  readonly density: Density;
}

export interface SidebarState {
  /** The view on screen in the main area. */
  readonly current: ViewId;
  /** The entry under the cursor while the sidebar has the focus. */
  readonly cursor: number;
  readonly isFocused: boolean;
}

/** Outer width of the sidebar box, border included. */
export const SIDEBAR_WIDTH = 26;
const LABEL_WIDTH = 18;
/** "Quit" comes after the last view group. */
const QUIT_GROUP = 2;

/**
 * The registered views, by group then order, then "Quit": built with the
 * session, so in the language the run speaks.
 */
export function sidebarEntries(views: readonly ViewDefinition[]): SidebarEntry[] {
  const sorted = [...views].sort((a, b) => a.group - b.group || a.order - b.order);
  return [
    ...sorted.map(({ id, label, group }) => ({ id, label, group })),
    { id: QUIT, label: MENU_LABELS.quit, group: QUIT_GROUP },
  ];
}

/** Index of the content row a click landed on → entry, ignoring the blank separators. */
export function entryAtRow(layout: SidebarLayout, row: number): number | null {
  const index = rowIndexes(layout).indexOf(row);
  return index === -1 ? null : index;
}

export function renderSidebar(layout: SidebarLayout, state: SidebarState, width: number): Line[] {
  const lines: Line[] = [];
  layout.entries.forEach((entry, index) => {
    if (startsGroup(layout, index)) lines.push([]);
    lines.push(entryLine({ entry, isUnderCursor: index === state.cursor }, state, width));
  });
  return lines;
}

function entryLine(
  item: { readonly entry: SidebarEntry; readonly isUnderCursor: boolean },
  state: SidebarState,
  width: number,
): Line {
  const { entry } = item;
  const isCurrent = entry.id === state.current;
  const isUnderCursor = state.isFocused && item.isUnderCursor;
  const line: Line = [
    seg(markerOf(isCurrent, isUnderCursor), "accent"),
    seg(fit(entry.label, LABEL_WIDTH), labelToneOf(entry, isCurrent)),
    seg(entry.badge?.text ?? "", entry.badge?.tone ?? "plain"),
  ];
  return isUnderCursor || (isCurrent && !state.isFocused)
    ? fillLine(line, width, "highlight")
    : line;
}

/** The view on screen is marked even without colour; the cursor shows while focused. */
function markerOf(isCurrent: boolean, isUnderCursor: boolean): string {
  if (isCurrent) return "▌ ";
  return isUnderCursor ? "› " : "  ";
}

function labelToneOf(entry: SidebarEntry, isCurrent: boolean): Tone {
  if (isCurrent) return "strong";
  return entry.id === QUIT ? "muted" : "plain";
}

/** A blank row before the first entry of each group but the first, unless compact. */
function startsGroup(layout: SidebarLayout, index: number): boolean {
  if (layout.density === "compact" || index === 0) return false;
  return layout.entries[index]?.group !== layout.entries[index - 1]?.group;
}

/** Content row of each entry, accounting for the blank separator rows. */
function rowIndexes(layout: SidebarLayout): number[] {
  let row = 0;
  return layout.entries.map((_entry, index) => {
    if (startsGroup(layout, index)) row++;
    return row++;
  });
}
