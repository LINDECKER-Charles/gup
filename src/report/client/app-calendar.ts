/**
 * Client "Calendar" page: one heatmap per year of the period, newest first.
 * The days form an ARIA grid with a single tab stop (roving tabindex): the
 * arrows move by day and by week, Home/End reach the period's ends, Enter
 * opens the sessions of the focused day. The focused or hovered day is
 * described in a live region beside the grid.
 */
export const CALENDAR_JS = String.raw`
const CALENDAR_MOVES = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

PAGES.calendar = page("calendar", renderCalendar);

function renderCalendar(body) {
  const range = periodRange();
  const detail = h("div", { class: "day-detail", id: IDS.dayDetail, "aria-live": "polite" });
  const firstYear = Number(dayKey(range.start).slice(0, 4));
  const years = [];
  for (let year = Number(dayKey(range.end).slice(0, 4)); year >= firstYear; year--) {
    years.push(yearCard(year, range));
  }
  appendAll(body, [
    h("div", { class: "page-intro" }, [h("p", null, t("calendar.intro")), heatLegend()]),
    detail,
    years,
  ]);
  const last = MODEL.days[MODEL.days.length - 1];
  const initial = last ? Math.min(range.end, Math.max(range.start, dayIndex(last[0]))) : range.end;
  activateDay(initial);
  describeDay(initial);
}

function yearCard(year, range) {
  const yearRange = {
    start: Math.max(range.start, dayIndex(year + "-01-01")),
    end: Math.min(range.end, dayIndex(year + "-12-31")),
  };
  const grid = heatGrid(yearRange, calendarCell);
  const rows = grid.querySelector(".heat-rows");
  rows.setAttribute("role", "grid");
  rows.setAttribute("aria-label", t("calendar.gridLabel", { year: year }));
  rows.querySelectorAll(".heat-row").forEach((row) => row.setAttribute("role", "row"));
  on(rows, "keydown", onCalendarKey);
  return card(String(year), grid);
}

function calendarCell(cell, index) {
  cell.setAttribute("role", "gridcell");
  cell.setAttribute("tabindex", "-1");
  cell.setAttribute("data-day", String(index));
  cell.setAttribute("aria-label",
    t("calendar.dayLabel", { day: fmtLongDay(index), summary: daySummary(index) }));
  withTooltip(cell, () => [fmtLongDay(index), daySummary(index)]);
  on(cell, "focus", () => describeDay(index));
  on(cell, "click", () => openDay(index));
}

function onCalendarKey(event) {
  const cell = event.target.closest("[data-day]");
  if (cell === null) return;
  const index = Number(cell.getAttribute("data-day"));
  const target = calendarTarget(event.key, index);
  if (target !== null) {
    event.preventDefault();
    focusDay(target);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDay(index);
  }
}

function calendarTarget(key, index) {
  const range = periodRange();
  if (key === "Home") return range.start;
  if (key === "End") return range.end;
  const move = CALENDAR_MOVES[key];
  if (move === undefined) return null;
  return Math.min(range.end, Math.max(range.start, index + move));
}

function dayCell(index) {
  return document.querySelector("[data-day=\"" + index + "\"]");
}

function focusDay(index) {
  activateDay(index);
  const cell = dayCell(index);
  if (cell !== null) cell.focus();
}

/** The one day of the calendar reachable with Tab. */
function activateDay(index) {
  document.querySelectorAll("[data-day][tabindex=\"0\"]").forEach((cell) => {
    cell.setAttribute("tabindex", "-1");
  });
  const cell = dayCell(index);
  if (cell !== null) cell.setAttribute("tabindex", "0");
}

function describeDay(index) {
  const detail = byId(IDS.dayDetail);
  if (detail === null) return;
  const hasActivity = DAY_ROWS.has(dayKey(index));
  const open = h("button", { type: "button", class: "button" }, t("calendar.openDay"));
  on(open, "click", () => openDay(index));
  detail.replaceChildren();
  appendAll(detail, [
    h("p", { class: "day-title" }, fmtLongDay(index)),
    h("p", { class: "day-summary" }, daySummary(index)),
    hasActivity ? open : null,
  ]);
}

function openDay(index) {
  navigate("#/sessions?day=" + dayKey(index));
}
`;
