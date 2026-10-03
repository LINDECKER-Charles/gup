/**
 * Client "Vue d'ensemble" page: the headline sentence and figure, the key
 * numbers (each a way into the page that details it), the calendar of the
 * latest weeks, attempts per week or month, the outdated-packages line, the
 * failures to watch, the most updated packages and the providers.
 */
export const OVERVIEW_JS = String.raw`
const OVERVIEW_WEEKS = 53;
const MAX_WEEK_COLUMNS = 60;
const WATCHED_FAILURES = 3;
const TOP_PACKAGES = 5;

PAGES.overview = page("overview", renderOverview);

function renderOverview(body) {
  appendAll(body, [
    heroSection(),
    kpiList(),
    activityCard(),
    h("div", { class: "grid-2" }, [rhythmCard(), outdatedCard()]),
    h("div", { class: "grid-2" }, [watchCard(), topPackagesCard()]),
    providersCard(),
  ]);
}

function heroSection() {
  const totals = MODEL.totals;
  return h("section", { class: "hero", "aria-label": t("overview.summary") }, [
    h("p", { class: "hero-figure" }, [
      h("span", { class: "hero-number" }, fmtNumber(totals.successes)),
      h("span", { class: "hero-unit" }, tn("overview.unit", totals.successes)),
    ]),
    h("div", { class: "hero-copy" }, [
      h("p", { class: "hero-sentence" }, heroSentence(totals)),
      h("p", { class: "hero-note" }, lastActivity(totals)),
    ]),
  ]);
}

function heroSentence(totals) {
  const lead = META.period.lead;
  if (totals.attempts + totals.scans === 0) return t("overview.empty", { lead: lead });
  if (totals.successes === 0) return t("overview.noSuccess", { lead: lead });
  return t("overview.sentence", {
    lead: lead,
    packages: tn("units.packages", totals.distinctPackages),
    rate: fmtPercent(totals.successRate),
  });
}

function lastActivity(totals) {
  const parts = [];
  if (totals.lastUpdateAt) {
    parts.push(t("overview.lastUpdate", { when: whenText(totals.lastUpdateAt) }));
  }
  if (totals.lastScanAt) parts.push(t("overview.lastScan", { when: whenText(totals.lastScanAt) }));
  return parts.length > 0 ? parts.join(" ") : t("overview.noActivity");
}

function whenText(iso) {
  const ms = Date.parse(iso);
  return fmtRelative(ms) + " (" + fmtDateTime(ms) + ")";
}

// ---- Key numbers -------------------------------------------------------------------

const KPI_TILES = [
  { key: "successRate", value: (totals) => orNone(totals.successRate, fmtPercent) },
  { key: "packages", href: "#/packages", value: (totals) => fmtNumber(totals.distinctPackages) },
  { key: "failures", href: "#/failures", value: (totals) => fmtNumber(totals.failures),
    tone: "failed" },
  { key: "skips", href: "#/sessions", value: (totals) => fmtNumber(totals.skips) },
  { key: "scans", href: "#/sessions", value: (totals) => fmtNumber(totals.scans) },
  { key: "outdated", value: (totals) => orNone(totals.lastOutdated, fmtNumber) },
];

/** A formatted value, or the dash of a missing one. */
function orNone(value, format) {
  return value === null ? t("common.none") : format(value);
}

function kpiList() {
  return h("ul", { class: "kpis", "aria-label": t("kpi.title") }, KPI_TILES.map(kpiTile));
}

function kpiTile(tile) {
  const totals = MODEL.totals;
  const isAlert = tile.tone !== undefined && totals[tile.key] > 0;
  const content = [
    h("span", { class: "kpi-value" }, tile.value(totals)),
    h("span", { class: "kpi-label" }, t("kpi." + tile.key)),
    h("span", { class: "kpi-hint" }, t("kpi.hints." + tile.key)),
  ];
  return h("li", { class: "kpi" + (isAlert ? " kpi-" + tile.tone : "") },
    tile.href ? link(tile.href, content, "kpi-link") : h("div", { class: "kpi-body" }, content));
}

// ---- Activity --------------------------------------------------------------------

function activityCard() {
  const range = periodRange();
  const earliest = mondayOf(range.end) - (OVERVIEW_WEEKS - 1) * 7;
  const recent = { start: Math.max(range.start, earliest), end: range.end };
  const describe = (index) => [fmtLongDay(index), daySummary(index)];
  return card(t("overview.activity"), [
    h("p", { class: "card-intro" }, t("overview.activityIntro")),
    heatGrid(recent, (cell, index) => {
      cell.classList.add("cell-link");
      withTooltip(cell, () => describe(index));
      on(cell, "click", () => openDay(index));
    }),
    heatLegend(),
  ], link("#/calendar", t("overview.openCalendar"), "card-link"));
}

function rhythmCard() {
  const buckets = activityBuckets();
  const total = buckets.list.reduce((all, bucket) => all + sum(bucket.values), 0);
  const title = t(buckets.unit === "week" ? "rhythm.weekly" : "rhythm.monthly");
  if (total === 0) return card(title, emptyState(t("rhythm.empty")));
  const caption = t("rhythm.caption",
    { attempts: tn("units.attempts", total), count: buckets.list.length });
  return card(title, figure({
    legend: statusLegend(),
    chart: stackedColumns(buckets.list, caption),
    table: dataTable(title, label("rhythm.columns"), buckets.list
      .filter((bucket) => sum(bucket.values) > 0)
      .map((bucket) => [bucket.title].concat(bucket.values.map(fmtNumber)))),
  }));
}

/** Weeks of the period, or months when there are too many weeks to read. */
function activityBuckets() {
  const range = periodRange();
  const weeks = Math.floor((mondayOf(range.end) - mondayOf(range.start)) / 7) + 1;
  return weeks <= MAX_WEEK_COLUMNS ? weekBuckets(range) : monthBuckets(range);
}

function weekBuckets(range) {
  const rows = new Map(MODEL.weeks.map((row) => [row[0], row]));
  const list = [];
  for (let monday = mondayOf(range.start); monday <= range.end; monday += 7) {
    const row = rows.get(dayKey(monday));
    const firstOfMonth = firstOfMonthWithin(monday, { start: monday, end: monday + 6 });
    list.push({
      title: t("rhythm.week", { day: fmtDay(monday) }),
      label: firstOfMonth === null ? "" : FORMATS.month.format(dayDate(firstOfMonth)),
      values: row ? [row[1], row[2], row[3]] : [0, 0, 0],
    });
  }
  return { unit: "week", list: list };
}

function monthBuckets(range) {
  const months = new Map();
  MODEL.days.forEach((row) => {
    const month = months.get(row[0].slice(0, 7)) || [0, 0, 0];
    months.set(row[0].slice(0, 7), [month[0] + row[1], month[1] + row[2], month[2] + row[3]]);
  });
  const last = dayKey(range.end).slice(0, 7);
  const list = [];
  for (let month = dayKey(range.start).slice(0, 7); month <= last; month = nextMonth(month)) {
    const name = FORMATS.monthYear.format(dayDate(dayIndex(month + "-01")));
    list.push({ title: name, label: name, values: months.get(month) || [0, 0, 0] });
  }
  return { unit: "month", list: list };
}

function nextMonth(month) {
  const year = Number(month.slice(0, 4));
  const next = Number(month.slice(5, 7)) + 1;
  return next > 12 ? year + 1 + "-01" : year + "-" + pad2(next);
}

function outdatedCard() {
  const title = t("outdated.title");
  if (MODEL.trend.length === 0) {
    return card(title, emptyState(t("outdated.empty"), t("outdated.emptyHint")));
  }
  const points = MODEL.trend.map((row) => ({ index: dayIndex(row[0]), value: row[1] }));
  const values = points.map((point) => point.value);
  const summary = t("outdated.summary", {
    max: fmtNumber(Math.max(...values)),
    min: fmtNumber(Math.min(...values)),
    current: fmtNumber(values[values.length - 1]),
  });
  const rows = points.map((point) => [fmtDay(point.index), fmtNumber(point.value)]);
  return card(title, figure({
    legend: h("p", { class: "chart-summary" }, summary),
    chart: trendChart(points, periodRange(), t("outdated.caption", { summary: summary })),
    table: dataTable(title, label("outdated.columns"), rows),
  }));
}

// ---- Failures to watch, most updated, providers ---------------------------------------

function watchCard() {
  const failures = MODEL.failures.slice(0, WATCHED_FAILURES);
  const title = t("overview.watch");
  if (failures.length === 0) {
    return card(title, emptyState(t("failures.none"), t("failures.noneHint")));
  }
  return card(title, h("ul", { class: "watch-list" }, failures.map(watchItem)),
    link("#/failures", t("overview.allFailures"), "card-link"));
}

function watchItem(failure) {
  return h("li", { class: "watch-item" }, [
    h("div", { class: "watch-head" }, [
      h("span", { class: "watch-count" }, t("failures.times", { n: fmtNumber(failure.count) })),
      packageButton(failure.package),
      h("span", { class: "muted" }, providerOf(failure.package).name),
    ]),
    h("p", { class: "watch-message" }, text(failure.message)),
  ]);
}

function topPackagesCard() {
  const top = MODEL.packages.slice(0, TOP_PACKAGES).filter((entry) => entry.successes > 0);
  const title = t("overview.top");
  if (top.length === 0) return card(title, emptyState(t("packages.none")));
  const max = top[0].successes;
  return card(title, h("ol", { class: "top-list" }, top.map((entry, index) => {
    const meter = h("span", { class: "meter-fill" });
    meter.style.setProperty("--ratio", String(entry.successes / max));
    return h("li", { class: "top-item" }, [
      h("div", { class: "top-name" }, [
        packageButton(index),
        h("span", { class: "muted" }, MODEL.providers[entry.provider].name),
      ]),
      h("span", { class: "meter", "aria-hidden": "true" }, meter),
      h("span", { class: "top-count" }, tn("units.successes", entry.successes)),
    ]);
  })), link("#/packages", t("overview.allPackages"), "card-link"));
}

function providersCard() {
  const providers = MODEL.providers;
  if (providers.length === 0) return null;
  const rows = providers.map((provider) => [
    provider.name,
    fmtNumber(provider.successes),
    fmtNumber(provider.failures),
    fmtNumber(provider.skips),
    orNone(provider.medianUpdateMs, fmtDuration),
    orNone(provider.medianScanMs, fmtDuration),
  ]);
  const title = t("providers.title");
  return card(title, dataTable(title, label("providers.columns"), rows));
}
`;
