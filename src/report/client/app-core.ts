/**
 * Client core of the HTML report: the decoded data, the French labels and
 * their plural forms, number/date/duration formatting in the report's time
 * zone, local-day arithmetic, and the DOM builders every page uses.
 *
 * Plain ES2022 run in the browser, kept in a raw template so the source is
 * shipped byte for byte (its CSP hash is computed over this exact text): no
 * backtick and no dollar-brace inside. The DOM is built with createElement,
 * text nodes and allow-listed attributes only — never parsed from a string.
 */
export const CORE_JS = String.raw`
const MODEL = readJson(IDS.data);
const LABELS = readJson(IDS.labels);
const META = MODEL.meta;
const DAY_MS = 86400000;
const NOON_MS = 43200000;
const PAGE_SIZE = 100;
const PAGES = {};
/** Read from the page's own SVG (its patterns): the script names no URL, not even a namespace. */
const SVG_NS = document.querySelector("svg.defs").namespaceURI;
const GENERATED_AT = Date.parse(META.generatedAt);
const ZONE = usableZone(META.timeZone);
const PLURALS = new Intl.PluralRules("fr-FR");
const FORMATS = {
  number: new Intl.NumberFormat("fr-FR"),
  decimal: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }),
  percent: new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }),
  date: zoned({ dateStyle: "medium" }),
  dateTime: zoned({ dateStyle: "medium", timeStyle: "short" }),
  time: zoned({ timeStyle: "short" }),
  dayParts: zoned({ year: "numeric", month: "2-digit", day: "2-digit" }),
  day: utc({ dateStyle: "medium" }),
  longDay: utc({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  shortDay: utc({ day: "numeric", month: "short" }),
  month: utc({ month: "short" }),
  monthYear: utc({ month: "short", year: "numeric" }),
  relative: new Intl.RelativeTimeFormat("fr", { numeric: "auto" }),
};
const RELATIVE_UNITS = [
  { unit: "minute", ms: 60000, below: 60 },
  { unit: "hour", ms: 3600000, below: 24 },
  { unit: "day", ms: DAY_MS, below: 30 },
  { unit: "month", ms: DAY_MS * 30, below: 12 },
  { unit: "year", ms: DAY_MS * 365, below: Infinity },
];
const HTML_ATTRIBUTES = new Set([
  "id", "class", "role", "tabindex", "type", "hidden", "title", "for", "colspan", "scope",
  "datetime", "value", "selected", "open", "lang", "autocomplete", "placeholder",
]);
const SVG_ATTRIBUTES = new Set([
  "class", "role", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy",
  "r", "rx", "d", "focusable", "text-anchor", "preserveAspectRatio",
]);
const state = {
  route: null,
  page: "",
  rendered: {},
  query: "",
  focusPage: false,
  drawerReturn: null,
  drawerPackage: null,
};

function readJson(id) {
  const node = document.getElementById(id);
  return JSON.parse(node === null ? "null" : node.textContent);
}

function usableZone(zone) {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: zone }).format(0);
    return zone;
  } catch {
    return undefined;
  }
}

function zoned(options) {
  return new Intl.DateTimeFormat("fr-FR", Object.assign({ timeZone: ZONE }, options));
}

function utc(options) {
  return new Intl.DateTimeFormat("fr-FR", Object.assign({ timeZone: "UTC" }, options));
}

// ---- Data -----------------------------------------------------------------

function text(index) {
  return index === NONE ? "" : MODEL.strings[index] || "";
}

function packageAt(index) {
  return MODEL.packages[index];
}

function providerOf(packageIndex) {
  return MODEL.providers[packageAt(packageIndex).provider];
}

function indexBy(column) {
  const groups = new Map();
  MODEL.updates.forEach((row) => {
    const list = groups.get(row[column]);
    if (list) list.push(row);
    else groups.set(row[column], [row]);
  });
  return groups;
}

// ---- Labels ---------------------------------------------------------------

function label(path) {
  const value = path.split(".").reduce((node, key) =>
    (node === undefined ? node : node[key]), LABELS);
  return value === undefined ? path : value;
}

function t(path, vars) {
  return fill(label(path), vars);
}

function tn(path, count, vars) {
  const forms = label(path);
  const form = PLURALS.select(count) === "one" ? forms.one : forms.other;
  return fill(form, Object.assign({ n: fmtNumber(count) }, vars));
}

function fill(template, vars) {
  const values = vars || {};
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
}

// ---- Formatting -----------------------------------------------------------

function fmtNumber(value) {
  return FORMATS.number.format(value);
}

function fmtPercent(ratio) {
  return FORMATS.percent.format(ratio);
}

function fmtDate(ms) {
  return FORMATS.date.format(new Date(ms));
}

function fmtDateTime(ms) {
  return FORMATS.dateTime.format(new Date(ms));
}

function fmtTime(ms) {
  return FORMATS.time.format(new Date(ms));
}

function fmtDay(index) {
  return FORMATS.day.format(dayDate(index));
}

function fmtLongDay(index) {
  return FORMATS.longDay.format(dayDate(index));
}

function fmtDuration(ms) {
  if (ms === NONE || ms < 0) return "";
  if (ms < 60000) return t("units.seconds", { s: FORMATS.decimal.format(ms / 1000) });
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("units.minutes", { m: minutes, s: pad2(seconds % 60) });
  return t("units.hours", { h: Math.floor(minutes / 60), m: pad2(minutes % 60) });
}

function fmtInterval(days) {
  if (days === null) return t("common.none");
  return t("units.interval", { n: Math.max(1, Math.round(days)) });
}

/** Relative to the report's generation: the report is a snapshot of that moment. */
function fmtRelative(ms) {
  const delta = ms - GENERATED_AT;
  const scale = RELATIVE_UNITS.find((entry) => Math.abs(delta) / entry.ms < entry.below);
  return FORMATS.relative.format(Math.round(delta / scale.ms), scale.unit);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// ---- Local days (YYYY-MM-DD keys, counted from the epoch) -------------------

function dayIndex(key) {
  const parts = key.split("-").map(Number);
  return Math.round(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS);
}

function dayKey(index) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function dayDate(index) {
  return new Date(index * DAY_MS + NOON_MS);
}

function weekdayOf(index) {
  return (dayDate(index).getUTCDay() + 6) % 7;
}

function mondayOf(index) {
  return index - weekdayOf(index);
}

/** The day of an instant, in the zone the report was generated in. */
function dayOfInstant(ms) {
  const parts = {};
  FORMATS.dayParts.formatToParts(new Date(ms)).forEach((part) => {
    parts[part.type] = part.value;
  });
  return parts.year + "-" + parts.month + "-" + parts.day;
}

/** The period as day indices: its first day (the first active one for "all") to its last. */
function periodRange() {
  const end = dayIndex(META.period.lastDay);
  if (META.period.firstDay !== null) return { start: dayIndex(META.period.firstDay), end };
  const first = MODEL.days.length > 0 ? dayIndex(MODEL.days[0][0]) : end - 364;
  return { start: Math.min(first, end), end };
}

// ---- DOM ------------------------------------------------------------------

function byId(id) {
  return document.getElementById(id);
}

function h(tag, attributes, children) {
  const element = document.createElement(tag);
  setAttributes(element, attributes, HTML_ATTRIBUTES);
  appendAll(element, children);
  return element;
}

function svg(tag, attributes, children) {
  const element = document.createElementNS(SVG_NS, tag);
  setAttributes(element, attributes, SVG_ATTRIBUTES);
  appendAll(element, children);
  return element;
}

function setAttributes(element, attributes, allowed) {
  Object.keys(attributes || {}).forEach((name) => {
    const value = attributes[name];
    if (value === null || value === undefined || value === false) return;
    if (!isAllowedAttribute(name, value, allowed)) throw new Error("attribute refused: " + name);
    element.setAttribute(name, value === true ? "" : String(value));
  });
}

/** Links stay inside the report; no event handler, style or source attribute ever. */
function isAllowedAttribute(name, value, allowed) {
  if (name === "href") return /^#\/[\w/?=&.-]*$/.test(String(value));
  return allowed.has(name) || /^(aria|data)-[a-z-]+$/.test(name);
}

function appendAll(element, children) {
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (Array.isArray(child)) appendAll(element, child);
    else if (child !== null && child !== undefined && child !== false) element.append(child);
  });
}

function on(element, type, handler) {
  element.addEventListener(type, handler);
  return element;
}

function link(href, content, className) {
  return h("a", { href: href, class: className || null }, content);
}

let nextId = 0;
function uid(prefix) {
  nextId += 1;
  return prefix + "-" + nextId;
}

function announce(message) {
  byId(IDS.live).textContent = message;
}
`;
