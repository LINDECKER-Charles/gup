/**
 * Client charts of the HTML report, drawn as inline SVG and HTML: stacked
 * columns of attempts per week or month, the outdated-packages line, and the
 * calendar heatmap. Thin marks, a 2 px gap between stacked segments, hairline
 * grid, rounded data ends; failures are hatched and skips dotted (CSS-styled
 * SVG patterns of the page), so no series is told by colour alone. Every
 * chart is an `<svg role="img">` with a summary label, and every page offers
 * a table of the same numbers.
 */
export const CHARTS_JS = String.raw`
const CHART = { width: 640, height: 220, top: 14, right: 10, bottom: 26, left: 40 };
const BAR_MAX_WIDTH = 24;
const BAR_RADIUS = 4;
const SEGMENT_GAP = 2;
const LABEL_MIN_SPACING = 46;
const HEAT_LEVELS = 4;
/** Plural labels counting each outcome, in status-code order. */
const STATUS_UNITS = ["successes", "failures", "skips"];

function plotArea() {
  return {
    left: CHART.left,
    top: CHART.top,
    width: CHART.width - CHART.left - CHART.right,
    height: CHART.height - CHART.top - CHART.bottom,
    bottom: CHART.height - CHART.bottom,
  };
}

function chartSvg(caption, children) {
  return svg("svg", {
    viewBox: "0 0 " + CHART.width + " " + CHART.height,
    role: "img",
    "aria-label": caption,
    class: "chart-svg",
  }, children);
}

/** 1, 2, 2.5 or 5 times a power of ten, at least value. */
function niceMax(value) {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(1, value))));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => value <= candidate * power);
  return step * power;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function gridLines(max, plot) {
  const ticks = Number.isInteger(max / 2) ? [0, max / 2, max] : [0, max];
  return ticks.map((tick) => {
    const y = round2(plot.bottom - (tick / max) * plot.height);
    const rule = { x1: plot.left, x2: plot.left + plot.width, y1: y, y2: y };
    return svg("g", { class: "tick" }, [
      svg("line", Object.assign({ class: tick === 0 ? "axis" : "grid" }, rule)),
      svg("text", { x: plot.left - 6, y: y + 4, "text-anchor": "end", class: "tick-label" },
        fmtNumber(tick)),
    ]);
  });
}

/** A column with a rounded top and a square foot. */
function barPath(box, radius) {
  const r = Math.min(radius, box.width / 2, box.height);
  const right = round2(box.x + box.width);
  const bottom = round2(box.y + box.height);
  const x = round2(box.x);
  const y = round2(box.y);
  return [
    "M" + x + " " + bottom,
    "V" + round2(y + r),
    "Q" + x + " " + y + " " + round2(x + r) + " " + y,
    "H" + round2(right - r),
    "Q" + right + " " + y + " " + right + " " + round2(y + r),
    "V" + bottom + "Z",
  ].join("");
}

// ---- Stacked columns ---------------------------------------------------------------

/** buckets: [{ label, title, values: [successes, failures, skips] }], oldest first. */
function stackedColumns(buckets, caption) {
  const plot = plotArea();
  const max = niceMax(Math.max(1, ...buckets.map((bucket) => sum(bucket.values))));
  const band = plot.width / Math.max(1, buckets.length);
  const columns = buckets.map((bucket, index) =>
    stackedColumn(bucket, { x: plot.left + index * band, band: band, max: max, plot: plot }));
  return chartSvg(caption, [gridLines(max, plot), columns, columnLabels(buckets, band, plot)]);
}

function stackedColumn(bucket, geometry) {
  const width = Math.min(BAR_MAX_WIDTH, Math.max(2, geometry.band * 0.68));
  const x = geometry.x + (geometry.band - width) / 2;
  const segments = bucket.values
    .map((value, code) => ({ value: value, code: code }))
    .filter((segment) => segment.value > 0);
  let base = geometry.plot.bottom;
  const marks = segments.map((segment, index) => {
    const full = (segment.value / geometry.max) * geometry.plot.height;
    // The gap is taken from the foot of each upper segment: the stack keeps its height.
    const height = Math.max(1, full - (index > 0 ? SEGMENT_GAP : 0));
    const radius = index === segments.length - 1 ? BAR_RADIUS : 0;
    base -= full;
    return svg("path", { d: barPath({ x: x, y: base, width: width, height: height }, radius),
      class: "mark mark-" + STATUS_NAMES[segment.code] });
  });
  const hit = svg("rect", {
    x: round2(geometry.x),
    y: geometry.plot.top,
    width: round2(geometry.band),
    height: geometry.plot.height,
    class: "hit",
  });
  withTooltip(hit, () => [bucket.title, bucketSummary(bucket.values)]);
  return svg("g", { class: "column" }, [marks, hit]);
}

function bucketSummary(values) {
  return values.map((value, code) => tn("units." + STATUS_UNITS[code], value)).join(" · ");
}

/** Labels under the columns, skipped where they would touch the previous one. */
function columnLabels(buckets, band, plot) {
  let lastX = -Infinity;
  const labels = [];
  buckets.forEach((bucket, index) => {
    const x = plot.left + index * band + band / 2;
    if (!bucket.label || x - lastX < LABEL_MIN_SPACING) return;
    lastX = x;
    labels.push(axisLabel(round2(x), "middle", bucket.label));
  });
  return labels;
}

function axisLabel(x, anchor, content) {
  const position = { x: x, y: CHART.height - 8, "text-anchor": anchor };
  return svg("text", Object.assign({ class: "tick-label" }, position), content);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function statusLegend() {
  return h("ul", { class: "legend" }, STATUS_NAMES.map((name) => h("li", null, [
    svg("svg", { width: 12, height: 12, "aria-hidden": "true", focusable: "false" },
      svg("rect", { width: 12, height: 12, rx: 3, class: "mark mark-" + name })),
    t("legend." + name),
  ])));
}

// ---- Outdated line ---------------------------------------------------------------

/** points: [{ index, value }] by day, oldest first; drawn as steps up to range.end. */
function trendChart(points, range, caption) {
  const plot = plotArea();
  const max = niceMax(Math.max(1, ...points.map((point) => point.value)));
  const start = points[0].index;
  const span = Math.max(1, range.end - start);
  const scale = {
    start: start,
    span: span,
    x: (index) => round2(plot.left + ((index - start) / span) * plot.width),
    y: (value) => round2(plot.bottom - (value / max) * plot.height),
  };
  const line = stepPath(points, scale, range.end);
  const last = points[points.length - 1];
  return chartSvg(caption, [
    gridLines(max, plot),
    svg("path", { d: line + "V" + plot.bottom + "H" + scale.x(scale.start) + "Z", class: "area" }),
    svg("path", { d: line, class: "line" }),
    svg("circle", { cx: scale.x(range.end), cy: scale.y(last.value), r: 4, class: "end-dot" }),
    trendAxis(points[0].index, range.end, plot),
    crosshair(points, scale, plot),
  ]);
}

function stepPath(points, scale, end) {
  let path = "M" + scale.x(points[0].index) + " " + scale.y(points[0].value);
  points.slice(1).forEach((point) => {
    path += "H" + scale.x(point.index) + "V" + scale.y(point.value);
  });
  return path + "H" + scale.x(end);
}

function trendAxis(start, end, plot) {
  return [
    axisLabel(plot.left, "start", fmtDay(start)),
    axisLabel(plot.left + plot.width, "end", fmtDay(end)),
  ];
}

/** A vertical hairline that follows the pointer to the day under it. */
function crosshair(points, scale, plot) {
  const guide = svg("line", { x1: 0, x2: 0, y1: plot.top, y2: plot.bottom, class: "crosshair" });
  const layer = svg("rect",
    { x: plot.left, y: plot.top, width: plot.width, height: plot.height, class: "hit" });
  guide.style.setProperty("visibility", "hidden");
  on(layer, "pointermove", (event) => {
    const index = dayAtPointer(event, layer, scale);
    const x = scale.x(index);
    guide.setAttribute("x1", x);
    guide.setAttribute("x2", x);
    guide.style.setProperty("visibility", "visible");
    showTooltip(guide, [fmtDay(index), tn("units.outdated", valueOn(points, index))]);
  });
  on(layer, "pointerleave", () => {
    guide.style.setProperty("visibility", "hidden");
    hideTooltip();
  });
  return [guide, layer];
}

function dayAtPointer(event, layer, scale) {
  const box = layer.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / Math.max(1, box.width)));
  return Math.round(scale.start + ratio * scale.span);
}

/** The value in force on a day: the last point at or before it. */
function valueOn(points, index) {
  let found = points[0];
  points.forEach((point) => {
    if (point.index <= index) found = point;
  });
  return found.value;
}

/** Charts wider than a small screen scroll sideways: they open on their latest days. */
function showLatest(root) {
  root.querySelectorAll(".heat-scroll, .chart-frame").forEach((frame) => {
    frame.scrollLeft = frame.scrollWidth;
  });
}

// ---- Heatmap ---------------------------------------------------------------

/** Levels 1-4 by the quartiles of the distinct non-zero counts; 0 stays 0. */
function levelScale(values) {
  const distinct = Array.from(new Set(values.filter((value) => value > 0))).sort((a, b) => a - b);
  const thresholds = [];
  for (let step = 1; step < HEAT_LEVELS && distinct.length > 0; step++) {
    thresholds.push(distinct[Math.ceil((step * distinct.length) / HEAT_LEVELS) - 1]);
  }
  return (value) => {
    if (value <= 0) return 0;
    return 1 + thresholds.filter((threshold) => value > threshold).length;
  };
}

const DAY_ROWS = new Map(MODEL.days.map((row) => [row[0], row]));
const HEAT_LEVEL = levelScale(MODEL.days.map((row) => row[1]));

/**
 * Week columns from the Monday of range.start, Monday at the top; days outside
 * the range are blank. decorate(cell, index) adds the page's behaviour.
 */
function heatGrid(range, decorate) {
  const first = mondayOf(range.start);
  const weeks = Math.floor((range.end - first) / 7) + 1;
  const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const cells = [];
    for (let week = 0; week < weeks; week++) {
      cells.push(heatCell(first + week * 7 + weekday, range, decorate));
    }
    return h("div", { class: "heat-row" }, cells);
  });
  const grid = h("div", { class: "heat" }, [
    monthHeader(first, weeks, range),
    h("div", { class: "heat-body" }, [weekdayColumn(), h("div", { class: "heat-rows" }, rows)]),
  ]);
  grid.style.setProperty("--weeks", String(weeks));
  return h("div", { class: "heat-scroll" }, grid);
}

function heatCell(index, range, decorate) {
  if (index < range.start || index > range.end) {
    return h("div", { class: "cell cell-out", "aria-hidden": "true" });
  }
  const row = DAY_ROWS.get(dayKey(index));
  const cell = h("div", { class: "cell", "data-level": HEAT_LEVEL(row ? row[1] : 0) });
  decorate(cell, index);
  return cell;
}

function monthHeader(first, weeks, range) {
  const labels = [];
  let lastColumn = -Infinity;
  for (let week = 0; week < weeks; week++) {
    const monthStart = firstOfMonthWithin(first + week * 7, range);
    if (monthStart === null || week - lastColumn < 3) continue;
    lastColumn = week;
    const name = h("span", null, FORMATS.month.format(dayDate(monthStart)));
    name.style.setProperty("grid-column", String(week + 1) + " / span 3");
    labels.push(name);
  }
  return h("div", { class: "heat-months", "aria-hidden": "true" }, labels);
}

/** The 1st of a month inside the week starting at monday, if any and in range. */
function firstOfMonthWithin(monday, range) {
  for (let day = monday; day < monday + 7; day++) {
    if (day >= range.start && day <= range.end && dayDate(day).getUTCDate() === 1) return day;
  }
  return null;
}

function weekdayColumn() {
  return h("div", { class: "heat-days", "aria-hidden": "true" },
    label("calendar.weekdays").map((name) => h("span", null, name)));
}

function heatLegend() {
  const levels = [0, 1, 2, 3, 4].map((level) => h("span", { class: "cell", "data-level": level }));
  return h("div", { class: "heat-legend", "aria-hidden": "true" }, [
    h("span", null, t("calendar.fewer")), levels, h("span", null, t("calendar.more")),
  ]);
}

/** "4 réussies, 1 échec, 2 scans" for a day, or that nothing happened. */
function daySummary(index) {
  const row = DAY_ROWS.get(dayKey(index));
  if (!row) return t("calendar.nothing");
  const parts = [tn("units.successes", row[1])];
  if (row[2] > 0) parts.push(tn("units.failures", row[2]));
  if (row[3] > 0) parts.push(tn("units.skips", row[3]));
  if (row[4] > 0) parts.push(tn("units.scans", row[4]));
  return parts.join(", ");
}
`;
