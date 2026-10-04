/**
 * Client package drawer: a native modal `<dialog>` (focus kept inside, Échap
 * closes, the page behind is inert) with a package's figures, the versions
 * its successful updates installed and every attempt with its message. The
 * open package is part of the address (`?pkg=` on any page,
 * `#/packages/<n>` too), so Back closes it; focus returns to what opened it.
 */
export const DRAWER_JS = String.raw`
const DRAWER_FACTS = [
  ["successes", (entry) => fmtNumber(entry.successes)],
  ["failures", (entry) => fmtNumber(entry.failures)],
  ["skips", (entry) => fmtNumber(entry.skips)],
  ["interval", (entry) => fmtInterval(entry.medianIntervalDays)],
  ["cadence", (entry) => t("cadenceDescriptions." + entry.cadence)],
  ["lastVersion", (entry) => text(entry.lastVersion) || t("common.none")],
  ["firstAt", (entry) => (entry.firstAt === NONE ? t("common.none") : fmtDateTime(entry.firstAt))],
  ["lastAt", (entry) => (entry.lastAt === NONE ? t("common.none") : fmtDateTime(entry.lastAt))],
];
const COPIED_MS = 2000;
const VISIBLE_VERSIONS = 8;
/** What the focus may go back to when the drawer closes. */
const FOCUS_RETURNS = "button, a[href], input, select, summary";
let rowsByPackage = null;

function initDrawer() {
  const dialog = byId(IDS.drawer);
  on(byId(IDS.drawerClose), "click", () => dialog.close());
  on(dialog, "close", onDrawerClosed);
  // A click on the backdrop lands on the dialog itself, outside its panel.
  on(dialog, "click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  const copy = byId(IDS.drawerCopy);
  copy.hidden = !(navigator.clipboard && typeof navigator.clipboard.writeText === "function");
  on(copy, "click", copyPackageId);
}

function openPackage(index) {
  state.drawerReturn = { element: document.activeElement, index: index };
  const day = state.route.query.get("day");
  const address = routeHash(state.route.page, { pkg: String(index), day: day });
  // A history entry of the page's own making: closing the drawer takes it back.
  state.drawerEntry = location.hash === address ? null : address;
  navigate(address);
}

/** Opens, refills or closes the drawer to match the address. */
function syncDrawer(route) {
  const dialog = byId(IDS.drawer);
  const index = drawerPackage(route);
  if (index === null) {
    if (dialog.open) dialog.close();
    return;
  }
  if (state.drawerPackage !== index || !dialog.open) fillDrawer(index);
  if (!dialog.open) dialog.showModal();
}

function drawerPackage(route) {
  const raw = route.page === "packages" && route.arg !== "" ? route.arg : route.query.get("pkg");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const index = Number(raw);
  return index < MODEL.packages.length ? index : null;
}

function onDrawerClosed() {
  hideTooltip();
  state.drawerPackage = null;
  // Closed by its button or Échap: the address forgets the package, and the
  // route, once the page is drawn again, gives the focus back.
  if (drawerPackage(state.route) !== null) {
    leaveDrawerAddress();
    return;
  }
  state.drawerEntry = null;
  restoreFocus();
}

/**
 * Back to the entry before the drawer when the page added it, so that Back
 * then leaves the page instead of opening the drawer again; otherwise (an
 * address typed or reloaded) a new entry without the package.
 */
function leaveDrawerAddress() {
  const isOwnEntry = state.drawerEntry !== null && state.drawerEntry === location.hash;
  state.drawerEntry = null;
  if (isOwnEntry) window.history.back();
  else navigate(routeHash(state.route.page, { day: state.route.query.get("day") }));
}

/** Back to what opened the drawer, or to the same package's button if the page was redrawn. */
function restoreFocus() {
  const origin = state.drawerReturn;
  state.drawerReturn = null;
  if (origin === null) return;
  const target = isFocusReturn(origin.element)
    ? origin.element
    : document.querySelector("[data-page-section]:not([hidden]) .package-link[data-package=\"" +
      origin.index + "\"]");
  if (target !== null) target.focus();
}

/**
 * A control still on screen. A row clicked outside its button leaves the
 * focus on the page or its main region, which the package's button replaces.
 */
function isFocusReturn(element) {
  return element instanceof HTMLElement && element.isConnected &&
    element.matches(FOCUS_RETURNS) && element.closest("[hidden]") === null;
}

function fillDrawer(index) {
  const entry = packageAt(index);
  const rows = packageAttempts(index);
  state.drawerPackage = index;
  byId(IDS.drawerProvider).textContent = providerOf(index).name;
  byId(IDS.drawerTitle).textContent = entry.id;
  byId(IDS.drawerCopy).textContent = t("drawer.copy");
  const body = byId(IDS.drawerBody);
  body.replaceChildren();
  appendAll(body, [drawerFacts(entry), versionsSection(rows), attemptsSection(rows)]);
  body.scrollTop = 0;
}

function packageAttempts(index) {
  if (rowsByPackage === null) rowsByPackage = indexBy(ROW.package);
  return rowsByPackage.get(index) || [];
}

function drawerFacts(entry) {
  return h("dl", { class: "facts" }, DRAWER_FACTS.map((fact) => h("div", { class: "fact" }, [
    h("dt", null, t("drawer.facts." + fact[0])),
    h("dd", null, fact[1](entry)),
  ])));
}

function drawerSection(title, body) {
  const titleId = uid("drawer-section");
  return h("section", { class: "drawer-section", "aria-labelledby": titleId }, [
    h("h3", { id: titleId }, title),
    body,
  ]);
}

/** The versions the successful updates installed, newest first; the latest few until asked. */
function versionsSection(rows) {
  const successes = rows.filter((row) => row[ROW.status] === STATUS.success);
  if (successes.length === 0) {
    return drawerSection(t("drawer.versions"), h("p", { class: "muted" }, t("drawer.noVersion")));
  }
  const list = h("ol", { class: "timeline" }, successes.map((row, index) =>
    h("li", { hidden: index >= VISIBLE_VERSIONS }, [
      h("time", { datetime: new Date(row[ROW.at]).toISOString() }, fmtDate(row[ROW.at])),
      h("span", { class: "versions" },
        versionsText(row[ROW.from], row[ROW.to]) || t("drawer.unknownVersions")),
    ])));
  return drawerSection(t("drawer.versions"), [list, allVersionsButton(list, successes.length)]);
}

function allVersionsButton(list, count) {
  if (count <= VISIBLE_VERSIONS) return null;
  const button = h("button", { type: "button", class: "link-button" },
    t("drawer.allVersions", { n: fmtNumber(count) }));
  return on(button, "click", () => {
    list.querySelectorAll("li[hidden]").forEach((item) => {
      item.hidden = false;
    });
    button.remove();
  });
}

function attemptsSection(rows) {
  return drawerSection(t("drawer.attempts", { n: fmtNumber(rows.length) }),
    h("ol", { class: "attempts" }, rows.map((row) => attemptItem(row, null))));
}

/** One attempt: status, what it did, when, how long, and the message it left. */
function attemptItem(row, heading) {
  const message = text(row[ROW.message]);
  const at = row[ROW.at];
  return h("li", { class: "attempt attempt-" + STATUS_NAMES[row[ROW.status]] }, [
    h("div", { class: "attempt-head" }, [
      statusPill(row[ROW.status]),
      heading,
      h("span", { class: "versions" }, versionsText(row[ROW.from], row[ROW.to])),
      h("time", { datetime: new Date(at).toISOString() }, fmtDateTime(at)),
      row[ROW.durationMs] === NONE
        ? null
        : h("span", { class: "duration" }, fmtDuration(row[ROW.durationMs])),
      attemptBadges(row),
    ]),
    message === "" ? null : h("pre", { class: "message" }, message),
  ]);
}

function attemptBadges(row) {
  const flags = row[ROW.flags];
  const retry = t("attempt.retry", { label: text(row[ROW.retry]) });
  return [
    (flags & FLAGS.retry) !== 0 ? badge(retry, "neutral") : null,
    (flags & FLAGS.elevated) !== 0 ? badge(t("attempt.elevated"), "neutral") : null,
    (flags & FLAGS.scheduled) !== 0 ? badge(t("attempt.scheduled"), "neutral") : null,
  ];
}

function copyPackageId() {
  const button = byId(IDS.drawerCopy);
  if (state.drawerPackage === null) return;
  navigator.clipboard.writeText(packageAt(state.drawerPackage).id).then(() => {
    button.textContent = t("drawer.copied");
    announce(t("drawer.copied"));
    setTimeout(() => {
      button.textContent = t("drawer.copy");
    }, COPIED_MS);
  }, () => announce(t("drawer.copyFailed")));
}
`;
