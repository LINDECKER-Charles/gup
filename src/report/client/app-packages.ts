/**
 * Client "Packages" page: every package of the period in a sortable table
 * (`aria-sort` headers), narrowed by the header search (package, provider,
 * version, failure message), a provider and a pace filter, shown 100 rows at
 * a time. A row opens the package's drawer.
 */
export const PACKAGES_JS = String.raw`
const CADENCE_ORDER = ["weekly", "monthly", "quarterly", "rare", "once", "none"];
const PACKAGE_COLUMNS = [
  { key: "name", isText: true, value: (row) => row.name, cell: (row) => packageButton(row.index) },
  { key: "provider", isText: true, value: (row) => row.providerName,
    cell: (row) => row.providerName },
  { key: "successes", value: (row) => row.entry.successes,
    cell: (row) => fmtNumber(row.entry.successes) },
  { key: "failures", value: (row) => row.entry.failures, cell: failuresCell },
  { key: "lastVersion", isText: true, isOptional: true, value: (row) => row.version || null,
    cell: (row) => row.version || t("common.none") },
  { key: "lastAt", value: (row) => (row.entry.lastAt === NONE ? null : row.entry.lastAt),
    cell: lastAtCell },
  { key: "interval", isOptional: true, value: (row) => row.entry.medianIntervalDays,
    cell: (row) => fmtInterval(row.entry.medianIntervalDays) },
  { key: "cadence", value: (row) => CADENCE_ORDER.indexOf(row.entry.cadence),
    cell: (row) => cadenceBadge(row.entry.cadence) },
];
const packagesTable = {
  provider: "",
  cadence: "",
  sort: "successes",
  isDescending: true,
  limit: PAGE_SIZE,
  step: PAGE_SIZE,
  rows: null,
  shownQuery: null,
};

// Redrawn on a visit only when the search changed meanwhile: a closed drawer finds its row again.
PAGES.packages = page("packages", renderPackages, () => {
  if (packagesTable.shownQuery !== state.query) refreshPackages();
});

function renderPackages(body) {
  if (MODEL.packages.length === 0) {
    body.append(emptyState(t("packages.none"), t("packages.noneHint")));
    return;
  }
  appendAll(body, [
    h("div", { class: "toolbar" }, [
      selectControl(t("packages.provider"), updatedProviders(),
        (value) => setPackageFilter("provider", value)),
      selectControl(t("packages.cadence"), cadenceOptions(),
        (value) => setPackageFilter("cadence", value)),
      h("p", { class: "result-count", id: IDS.packagesCount }),
    ]),
    h("div", { class: "search-note", id: IDS.packagesSearch, hidden: true }),
    h("div", { class: "table-wrap" }, h("table", { class: "packages" }, [
      h("caption", null, t("packages.caption")),
      packagesHead(),
      h("tbody", { id: IDS.packagesBody }),
    ])),
    h("div", { class: "more-slot", id: IDS.packagesMore }),
  ]);
}

function cadenceOptions() {
  return [["", t("packages.allCadences")]].concat(CADENCE_ORDER.map((cadence) =>
    [cadence, t("cadenceDescriptions." + cadence)]));
}

function setPackageFilter(name, value) {
  packagesTable[name] = value;
  packagesTable.limit = PAGE_SIZE;
  refreshPackages();
}

function packagesHead() {
  return h("thead", null, h("tr", null, PACKAGE_COLUMNS.map((column) => {
    const button = h("button", { type: "button", class: "sort" }, [
      t("packages.columns." + column.key),
      h("span", { class: "sort-icon", "aria-hidden": "true" }),
    ]);
    on(button, "click", () => sortPackagesBy(column));
    return h("th", { scope: "col", class: columnClass(column), "data-column": column.key }, button);
  })));
}

function columnClass(column) {
  return [column.isText ? "" : "num", column.isOptional ? "optional" : ""].join(" ").trim() || null;
}

function sortPackagesBy(column) {
  if (packagesTable.sort === column.key) packagesTable.isDescending = !packagesTable.isDescending;
  else {
    packagesTable.sort = column.key;
    packagesTable.isDescending = !column.isText;
  }
  refreshPackages();
}

function refreshPackages() {
  const body = byId(IDS.packagesBody);
  if (body === null) return;
  packagesTable.shownQuery = state.query;
  const rows = sortedPackages(filteredPackages());
  body.replaceChildren(...rows.slice(0, packagesTable.limit).map(packageRow));
  if (rows.length === 0) {
    const cell = h("td", { colspan: PACKAGE_COLUMNS.length, class: "no-match" },
      t("packages.noMatch"));
    body.append(h("tr", null, cell));
  }
  byId(IDS.packagesCount).textContent = packagesCount(rows.length);
  announce(packagesCount(rows.length));
  updateSortHeaders();
  updateSearchNote();
  const more = byId(IDS.packagesMore);
  more.replaceChildren();
  appendAll(more, moreButton(packagesTable, rows.length, refreshPackages));
}

function packagesCount(count) {
  const total = MODEL.packages.length;
  if (count === total) return tn("units.packages", total);
  return tn("packages.countOf", count, { total: fmtNumber(total) });
}

function packageRow(row) {
  const cells = PACKAGE_COLUMNS.map((column, index) => {
    const content = column.cell(row);
    const attributes = { class: columnClass(column) };
    if (index > 0) return h("td", attributes, content);
    return h("th", Object.assign({ scope: "row" }, attributes), content);
  });
  return on(h("tr", { "data-package": row.index }, cells), "click", () => openPackage(row.index));
}

function failuresCell(row) {
  const count = row.entry.failures;
  if (count === 0) return fmtNumber(0);
  return h("span", { class: "failure-count" }, [
    h("span", { "aria-hidden": "true" }, t("status.failed.icon") + " "), fmtNumber(count),
  ]);
}

function lastAtCell(row) {
  const at = row.entry.lastAt;
  if (at === NONE) return t("common.none");
  return h("time", { datetime: new Date(at).toISOString(), title: fmtDateTime(at) }, fmtDate(at));
}

function updateSortHeaders() {
  document.querySelectorAll("th[data-column]").forEach((header) => {
    const isSorted = header.getAttribute("data-column") === packagesTable.sort;
    const direction = packagesTable.isDescending ? "descending" : "ascending";
    if (isSorted) header.setAttribute("aria-sort", direction);
    else header.removeAttribute("aria-sort");
    const icon = header.querySelector(".sort-icon");
    icon.textContent = isSorted ? t("packages.sortIcons." + direction) : "";
  });
}

function updateSearchNote() {
  const note = byId(IDS.packagesSearch);
  note.hidden = state.query === "";
  if (note.hidden) return;
  const clear = h("button", { type: "button", class: "link-button" }, t("search.clear"));
  on(clear, "click", () => setSearch(""));
  note.replaceChildren(h("span", null, t("search.active", { query: state.query })), clear);
}

// ---- Rows --------------------------------------------------------------------

function filteredPackages() {
  const terms = state.query.toLowerCase().split(/\s+/).filter((term) => term !== "");
  return packageRows().filter((row) =>
    (packagesTable.provider === "" || String(row.entry.provider) === packagesTable.provider) &&
    (packagesTable.cadence === "" || row.entry.cadence === packagesTable.cadence) &&
    terms.every((term) => row.search.indexOf(term) >= 0));
}

function sortedPackages(rows) {
  const column = PACKAGE_COLUMNS.find((candidate) => candidate.key === packagesTable.sort);
  const direction = packagesTable.isDescending ? -1 : 1;
  return rows.slice().sort((a, b) => compareValues(column.value(a), column.value(b), direction) ||
    a.name.localeCompare(b.name, LOCALE));
}

/** Missing values last, whatever the direction. */
function compareValues(a, b, direction) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "string") return direction * a.localeCompare(b, LOCALE, { sensitivity: "base" });
  return direction * (a - b);
}

function packageRows() {
  if (packagesTable.rows !== null) return packagesTable.rows;
  const messages = failureMessages();
  packagesTable.rows = MODEL.packages.map((entry, index) => {
    const provider = MODEL.providers[entry.provider];
    const version = text(entry.lastVersion);
    const search = [entry.id, provider.name, provider.id, version]
      .concat(messages.get(index) || [])
      .join("\n")
      .toLowerCase();
    return { index: index, entry: entry, name: entry.id, providerName: provider.name,
      version: version, search: search };
  });
  return packagesTable.rows;
}

function failureMessages() {
  const messages = new Map();
  MODEL.failures.forEach((failure) => {
    const list = messages.get(failure.package) || [];
    list.push(text(failure.message));
    messages.set(failure.package, list);
  });
  return messages;
}
`;
